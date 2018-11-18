const axios = require('axios');
const crypto = require('crypto');

const paysafe_api = axios.create({
    baseURL: process.env.PAYSAFE_API,
    timeout: 1000,
    headers: {
        Authorization: 'Basic ' + Buffer.from(process.env.PAYSAFE_API_KEY).toString('base64'),
        'Content-Type': 'application/json'
    }
});

exports.postDonation = async function(event, context) {
    let request;
    try {
        request = JSON.parse(event.body);
    } catch (error) {
        return addCors({
            statusCode: 400,
            body: JSON.stringify({ message: 'Malformed request body.' })
        });
    }

    switch (request.payment_provider) {
        case 'paysafecard':
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

function addCors(response) {
    response.headers = {
        'Access-Control-Allow-Origin': process.env.CORS_ALLOWED_ORIGIN
    };
    return response;
}
