const axios = require('axios');
const crypto = require('crypto');
const AWS = require('aws-sdk');
const s3 = new AWS.S3({ apiVersion: '2006-03-01' });

const PAYSAFE_PARAMS = {
    baseURL: process.env.PAYSAFE_API,
    timeout: 1000,
    headers: {
        Authorization: 'Basic ' + Buffer.from(process.env.PAYSAFE_API_KEY).toString('base64'),
        'Content-Type': 'application/json'
    }
};

const MOLLIE_PARAMS = {
    baseURL: 'https://api.mollie.com/v2/',
    timeout: 1000,
    headers: {
        Authorization: 'Bearer ' + process.env.MOLLIE_API_KEY,
        'Content-Type': 'application/json'
    }
};

exports.postDonation = async function(event, context) {
    const COINDGATE_PARAMS = {
        baseURL: 'https://api.coingate.com/v2/',
        timeout: 1000,
        headers: {
            Authorization: 'Token ' + process.env.COINGATE_API_KEY,
            'Content-Type': 'application/json'
        }
    };

    let request;

    try {
        if (event && event.body) {
            request = JSON.parse(event.body);

            if (!request.data) throw 'The request has no payload.';
        } else {
            throw 'Malformed request.';
        }
    } catch (error) {
        return addCors({
            statusCode: 400,
            body: JSON.stringify({ message: 'Malformed request body: ' + error })
        });
    }

    switch (request.payment_provider) {
        case 'paysafecard':
            const paysafe_api = axios.create(PAYSAFE_PARAMS);
            return await paysafe_api
                .post('payments', {
                    type: 'PAYSAFECARD',
                    amount: request.data.amount,
                    currency: request.data.currency,
                    redirect: {
                        success_url: request.data.successUrl,
                        failure_url: request.data.failureUrl
                    },
                    notification_url: process.env.BASE_URL + 'capture/{payment_id}',
                    customer: {
                        id: crypto.randomBytes(25).toString('hex')
                    }
                })
                .then(response => {
                    if (response.data.status === 'INITIATED') {
                        return addCors({
                            statusCode: 200,
                            body: JSON.stringify({ auth_url: response.data.redirect.auth_url })
                        });
                    }

                    throw 'Bad status: ' + response.data.status;
                })
                .catch(error => {
                    return addCors({
                        statusCode: 502,
                        body: JSON.stringify({ message: 'Paysafe payment initiation failed.' })
                    });
                });
            break;
        case 'checkoutportal':
            let data = request.data;

            const hmac = crypto.createHmac('sha512', process.env.SECRET);
            const hmac_data_order = [
                'customerId',
                'amount',
                'currency',
                'language',
                'orderDescription',
                'successUrl',
                'orderReference',
                'customerStatement',
                'shopId',
                'requestFingerprintOrder'
            ];

            data['customerId'] = process.env.CUSTOMER_ID;
            data['orderReference'] = crypto.randomBytes(12).toString('hex'); // Add some randomness to the hash so it cannot be guessed as easily
            data['requestFingerprintOrder'] = 'secret,' + hmac_data_order.join(',');

            data['donationReference'] = data['orderReference'];
            hmac.update(process.env.SECRET + hmac_data_order.reduce((str, index) => str + data[index], ''));
            data['requestFingerprint'] = hmac.digest('hex');

            return addCors({
                statusCode: 200,
                body: JSON.stringify(data)
            });
            break;
        case 'mollie':
            if (!request.data.metadata.donation_reference)
                return addCors({
                    statusCode: 400,
                    body: JSON.stringify({ message: 'No donation_reference provided.' })
                });

            const mollie_api = axios.create(MOLLIE_PARAMS);
            return await mollie_api
                .post('payments', request.data)
                .then(response => {
                    return s3
                        .putObject({
                            Bucket: process.env.DONATION_ID_BUCKET,
                            Key: response.data.metadata.donation_reference,
                            Body: response.data.id
                        })
                        .promise()
                        .then(data => {
                            return addCors({
                                statusCode: 200,
                                body: JSON.stringify({ auth_url: response.data['_links']['checkout']['href'] })
                            });
                        })
                        .catch(error => {
                            return addCors({
                                statusCode: 500,
                                body: JSON.stringify({ message: 'Saving the id failed.' })
                            });
                        });
                })
                .catch(error => {
                    return addCors({
                        statusCode: 502,
                        body: JSON.stringify({ message: 'Mollie payment initiation failed.' })
                    });
                });
            break;
        case 'coingate':
            let coingate_api = axios.create(COINDGATE_PARAMS);

            return await coingate_api
                .post('orders', request.data)
                .then(response => {
                    return addCors({
                        statusCode: 200,
                        body: JSON.stringify({ auth_url: response.data['payment_url'] })
                    });
                })
                .catch(error => {
                    return addCors({
                        statusCode: 502,
                        body: JSON.stringify({ message: 'CoinGate payment initiation failed.' })
                    });
                });
            break;
        default:
            return addCors({
                statusCode: 400,
                body: JSON.stringify({ message: 'Unsupported payment provider.' })
            });
    }

    return addCors({
        statusCode: 400,
        body: JSON.stringify({ message: 'Bad request.' })
    });
};

exports.captureDonation = async function(event, context) {
    const paysafe_api = axios.create(PAYSAFE_PARAMS);

    let payment_id = event.pathParameters.proxy;

    return await paysafe_api.get('payments/' + payment_id).then(response => {
        if (response.data.status === 'AUTHORIZED') {
            return paysafe_api.post('payments/' + payment_id + '/capture').then(response => {
                if (response.data.status === 'SUCCESS') {
                    return addCors({
                        statusCode: 200,
                        body: JSON.stringify('We have captured the payment.')
                    });
                }
            });
        }
    });
};

exports.stateDonation = async function(event, context) {
    if (!event.pathParameters.proxy)
        return addCors({
            statusCode: 400,
            body: JSON.stringify({ message: 'No donation_reference provided.' })
        });

    const mollie_api = axios.create(MOLLIE_PARAMS);
    return await s3
        .getObject({
            Bucket: process.env.DONATION_ID_BUCKET,
            Key: event.pathParameters.proxy
        })
        .promise()
        .then(data => {
            return mollie_api.get('payments/' + data.Body).then(response => {
                return addCors({
                    statusCode: 200,
                    body: JSON.stringify({
                        status: response.data.status,
                        reference: response.data.metadata.donation_reference
                    })
                });
            });
        })
        .catch(error => {
            return addCors({
                statusCode: 500,
                body: JSON.stringify({ message: 'State request failed for unknown reason.' })
            });
        });
};

function addCors(response) {
    response.headers = {
        'Access-Control-Allow-Origin': process.env.CORS_ALLOWED_ORIGIN
    };
    return response;
}
