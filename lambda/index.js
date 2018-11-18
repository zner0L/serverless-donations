const crypto = require("crypto");

exports.postDonation = async function(event, context) {
    const hmac = crypto.createHmac('sha512', process.env.SECRET);
    const hmac_data_order = ["customerId", "amount", "currency", "language", "orderDescription", "successUrl", "orderReference", "customerStatement", "shopId", "requestFingerprintOrder"]

    let data; 
    try {
        data = JSON.parse(event.body);
    } catch(error) {
        return addCors({
            statusCode: 400,
            body: JSON.stringify({ message: 'Malformed request body.' })
        });
    }

    data["customerId"] = process.env.CUSTOMER_ID;
    data["orderReference"] = crypto.randomBytes(12).toString('hex'); // Add some randomness to the hash so it cannot be guessed as easily
    data["requestFingerprintOrder"] = 'secret,' + hmac_data_order.join(',');

    data["donationReference"] = data["orderReference"];
    hmac.update(process.env.SECRET + hmac_data_order.reduce((str, index) => str + data[index], ''));
    data["requestFingerprint"] = hmac.digest('hex');

	return addCors({
        "statusCode": 200,
        "body": JSON.stringify(data)
    });
}

function addCors(response) {
    response.headers = {
        'Access-Control-Allow-Origin': process.env.CORS_ALLOWED_ORIGIN
    };
    return response;
}