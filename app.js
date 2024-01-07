const express = require('express');
const axios = require('axios');
const mysql = require('mysql2');
const SquareClient = require('./squareClient');
// const SquareClient = require(SquareClient)
const TadabaseClient = require('./tadabaseClient')
// const TadabaseClient = require(TadabaseClient)
require('dotenv').config();
const https = require('https');

const app = express();
app.use(express.json());

// Define MySQL connection
const mysqlConnection = mysql.createConnection({
    host: process.env.MYSQL_HOST,
    user: process.env.MYSQL_USER,
    password: process.env.MYSQL_PASSWORD,
    database: process.env.MYSQL_DATABASE
});

mysqlConnection.connect(error => {
    if (error) {
        console.error('Error connecting to MySQL:', error);
        return;
    }
    console.log('Connected to MySQL');
});

app.post('/version', async (req, res) => {
    console.log('hello');
    return 200;
});

// The notifications endpoint
app.post('/notifications', async (req, res) => {
    const notification = req.body;

    // console.log(notification);

    const eventType = notification?.data?.type || notification?.event_type;
    const paymentId = notification?.data?.object?.payment?.id || notification?.entity_id;

    // Basic validation
    if (!eventType || !paymentId) {
        return res.status(400).send('Invalid notification data');
    }

    console.log("type: " + eventType + " PaymentID: " + paymentId);

    try {
        console.log("checking if payment already exists");
        const paymentExists = await checkIfPaymentExists(paymentId);
        if (paymentExists) {
            console.log(`Duplicate payment ID found:, skipping.`);
            return res.status(200).send('Duplicate payment, skipped.');
        }

        console.log("Payment ID is unique. execute the process");
        // Process the notification
        processNotification(notification);

        // Mark the payment ID as processed
        await markEventIdAsProcessed(paymentId);

        res.status(200).send('Notification processed successfully');
    } catch (error) {
        console.error('Error processing notification:', error);
        res.status(500).send('Internal server error');
    }
});

async function processNotification(notification) {

    console.log('Loading Configuration ... ')
    const square = new SquareClient(process.env.SQUARE);
    const tadabase = new TadabaseClient(process.env.TADABASE1, process.env.TADABASE2, process.env.TADABASE3);

    const payment = notification.data.object.payment;
    const paymentId = payment.id;
    const locationId = payment.location_id;
    const eventType = notification.data.type;

    console.log(`Processing payment ID: ${paymentId} for event type: ${eventType}`);

    try {
        if (eventType === 'payment.updated' || eventType === 'payment') {
            
            // Check if the payment already exists in Tadabase
            const exists = await checkIfPaymentExistsInTadabase(tadabase, "m72NporwvZ", paymentId);
            if (exists) {
                console.log(`Payment id ${paymentId} exists, skipping notification`);
                return;
            }

            // Get location information
            // const location = await square.getLocationInfo(locationId);

            // Get employee information
            const employee = payment.employee_id ? await fetchEmployeeInfo(payment.employee_id, square) : {};

            const timestamp = formatDateTime(payment.created_at);

            // Determine payment method and device details
            let paymentMethod, deviceDetails;
            if (payment.card_details) {
                paymentMethod = `${payment.card_details.card.card_type} ${payment.source_type}`;
                deviceDetails = payment.card_details.device_details.device_name;
            } else {
                // Adjust this part based on other payment types like 'CHECK', 'CASH', etc.
                paymentMethod = 'OTHER';
                deviceDetails = payment.device_details?.device_name || 'N/A';
            }


             // Prepare data for Tadabase
             let paymentRecord = {
                'field_220': paymentId, //Square Payment ID
                'field_318': new Date(payment.created_at).toISOString(), //Date of Payment
                'field_320': convertCurrency(payment.total_money.amount), //Total Charge
                // 'field_322': '', //First 4 - Formula
                'field_323': employee,
                'field_325': paymentMethod, //Payment Method
                // 'field_327': '', //Payment Info Formula
                // 'field_330': '', //Reference Only - Date as Text
                'field_331': payment.card_details.card.card_brand, //Credit Card Brand
                'field_332': payment.card_details.entry_method, //Entry Method
                'field_333': payment.card_details.card.last_4, //PAN Suffix
                'field_334': deviceDetails, //Device Name
                'field_336': "https://squareup.com/dashboard/sales/transactions/" + payment.order_id, //Open in Square
                'field_339': '', //Connection - Jobs
                'field_383': payment.source_type, //Source
                'field_384': convertCurrency(payment.processing_fee[0].amount_money.amount), //Fees - Total
                'field_385': calculateFeePercentage(convertCurrency(payment.total_money.amount), convertCurrency(payment.processing_fee[0].amount_money.amount)), //Fee Percent
            };

            // Insert data into Tadabase
            let tadabaseTableId = 'm72NporwvZ'; // Replace with your actual Table ID
            const savedPaymentID = await tadabase.insertData(tadabaseTableId, paymentRecord);

            const orderDetails = await square.getOrderDetails(payment.order_id);
            orders = orderDetails.line_items;

            // console.log('Order Details:', orders);

            discounts = 0

            if (payment.source_type !== "INVOICE"){
                let catalog_id;

                orders.forEach(async order => { 
                    gross_sales = convertCurrency(order.gross_sales_money.amount)
                    discount = convertCurrency(order.total_discount_money.amount)
                    sales_tax = convertCurrency(order.applied_taxes[0].applied_money.amount)
                    net_sales = gross_sales - (discount + sales_tax)

                    try{

                        const params = {
                            items: [
                                {
                                    field_id: 'field_390', // Replace with the actual field key
                                    operator: 'is',
                                    val: order.catalog_object_id // Value to filter by
                                }
                                // Add more filter objects as needed
                            ]
                        };

                        console.log("params",params);

                        const product = await tadabase.getData('W0VNq8rmlK', params);

                        console.log('product: ', product);
                        if (product && product.items && product.items.length == 0){
                            let productData = {
                                'field_390': order.catalog_object_id,
                                'field_362': order.variation_name,
                            };

                            let catalog = await tadabase.insertData('W0VNq8rmlK', productData);
                            catalog_id = catalog.recordId
                        }else{
                            catalog_id = product[0].id
                        }


                    }catch(e){
                        console.log('error: ', e)
                    }
    
                    console.log("cat: ", catalog_id);
                    // Prepare revenue details data for Tadabase
                    let revenueDetails = {
                        'field_340': new Date(payment.created_at).toISOString(), //Date
                        'field_388': new Date(payment.created_at).toISOString(), //Time
                        'field_391': 'Square', //Source
                        'field_341': employee,
                        'field_386': '', //Category
                        'Item': order.name, //Item
                        'field_344': order.quantity, //Qty
                        'field_393': order.variation_name, //Price Point Name
                        'field_346': order.catalog_object_id, //SKU
                        'field_347': '', //Modifiers Applied
                        'field_348': gross_sales, //Gross Sales
                        'field_349': discount, //Discounts
                        'field_350': net_sales, //Net Sales
                        'field_351': sales_tax, //Sales Tax
                        'field_352': '', //Tips
                        'field_353': payment.order_id, //Transaction ID
                        'field_282': savedPaymentID.recordId, //Connection - Square Payment ID
                        'field_354': deviceDetails, //Device Name
                        'field_356':  "https://squareup.com/dashboard/sales/transactions/" + payment.order_id, //Details Link to Square
                        'field_363': catalog_id, //Connection - Product Item Catalog
                        'field_364': '', //Connection - Jobs
                    };
    
                    // Insert data into Tadabase
                    let revTableID = 'l5nQxLQxYX'; // Replace with your actual Table ID
                    await tadabase.insertData(revTableID, revenueDetails);
    
                    discounts += convertCurrency(order.total_discount_money.amount)

    
                }); 
            }
           

            const paymentDetails = await square.getPaymentDetails(payment.id);

            tips = convertCurrency(paymentDetails.payment?.tip_money?.amount ?? 0);

            if (tips > 0){
                let tipsRecords = {
                    'field_340': new Date(payment.created_at).toISOString(), //Date
                    'field_388': new Date(payment.created_at).toISOString(), //Time
                    'field_391': 'Square', //Source
                    'field_341': employee,
                    'field_386': 'Tips', //Category
                    'field_387': 'Tips', //Item
                    'field_344': '', //Qty
                    'field_393': '', //Price Point Name
                    'field_346': '', //SKU
                    'field_347': '', //Modifiers Applied
                    'field_348': '', //Gross Sales
                    'field_349': '', //Discounts
                    'field_350': '', //Net Sales
                    'field_351': '', //Sales Tax
                    'field_352': convertCurrency(paymentDetails.payment?.tip_money?.amount ?? 0), //Tips
                    'field_353': payment.order_id, //Transaction ID
                    'field_282': savedPaymentID.recordId, //Connection - Square Payment ID
                    'field_354': deviceDetails, //Device Name
                    'field_356':  "https://squareup.com/dashboard/sales/transactions/" + payment.order_id, //Details Link to Square
                    'field_363': '', //Connection - Product Item Catalog
                    'field_364': '', //Connection - Jobs
                };
    
                // Insert data into Tadabase
                await tadabase.insertData('l5nQxLQxYX', tipsRecords);
            }            
           

            if (discounts > 0){
                let discounts_record = {
                    'field_340': new Date(payment.created_at).toISOString(), //Date
                    'field_388': new Date(payment.created_at).toISOString(), //Time
                    'field_391': 'Square', //Source
                    'field_341': employee,
                    'field_386': 'Discounts', //Category
                    'field_387': 'Discounts', //Item
                    'field_344': '', //Qty
                    'field_393': '', //Price Point Name
                    'field_346': '', //SKU
                    'field_347': '', //Modifiers Applied
                    'field_348': '', //Gross Sales
                    'field_349': discounts, //Discounts
                    'field_350': '', //Net Sales
                    'field_351': '', //Sales Tax
                    'field_352': '', //Tips
                    'field_353': payment.order_id, //Transaction ID
                    'field_282': savedPaymentID.recordId, //Connection - Square Payment ID
                    'field_354': deviceDetails, //Device Name
                    'field_356':  "https://squareup.com/dashboard/sales/transactions/" + payment.order_id, //Details Link to Square
                    'field_363': '', //Connection - Product Item Catalog
                    'field_364': '', //Connection - Jobs
                };
    
                // Insert data into Tadabase
                await tadabase.insertData('l5nQxLQxYX', discounts_record);
            }
            
            

            console.log('Notification processed successfully.');
        }
    } catch (error) {
        console.error('Error processing notification:', error);
    }
}


// Helper function to check if a payment ID already exists
function checkIfPaymentExists(paymentId) {
    return new Promise((resolve, reject) => {
        mysqlConnection.query('SELECT * FROM event_ids WHERE id = ?', [paymentId], (err, results) => {
            if (err) {
                reject(err);
            } else {
                resolve(results.length > 0);
            }
        });
    });
}

async function checkIfPaymentExistsInTadabase(tadabaseClient, tableId, paymentId) {
    try {
        const params = {
            items: [
                {
                    field_id: 'field_220', // Replace with the actual field key
                    operator: 'is',
                    val: paymentId // Value to filter by
                }
                // Add more filter objects as needed
            ]
        };
        const data = await tadabaseClient.getData(tableId, params);

        return data && data.length > 0;
    } catch (error) {
        console.error('Error checking if payment exists in Tadabase:', error);
        throw error;
    }
}

async function fetchEmployeeInfo(employeeId ,square) {
    try {
        // const employeeId = 'employee_id_here'; // Replace with actual employee ID
        const employeeInfo = await square.getEmployeeInfo(employeeId);
        // console.log('Employee Info:' , employeeInfo.given_name + " " + employeeInfo.family_name );

        return employeeInfo.given_name + " " + employeeInfo.family_name
    } catch (error) {
        console.error('Error fetching employee info:', error);
    }
}


// Helper function to mark a payment ID as processed
function markEventIdAsProcessed(eventId) {
    return new Promise((resolve, reject) => {
        mysqlConnection.query('INSERT INTO event_ids (id) VALUES (?)', [eventId], (err, results) => {
            if (err) {
                reject(err);
            } else {
                resolve(results.insertId);
            }
        });
    });
}

function convertCurrency(amount) {
    try {
        amount = amount.toString();
        return parseFloat(amount.slice(0, -2) + '.' + amount.slice(-2));
    } catch (error) {
        console.error('Error converting currency:', error);
        return amount;
    }
}

function calculateFeePercentage(totalAmount, feeAmount) {
    if (totalAmount === 0) {
        return 0; // To avoid division by zero
    }

    const percentage = (feeAmount / totalAmount) * 100;
    return percentage.toFixed(2); // Rounds the result to 2 decimal places
}

function formatDateTime(dateTimeString) {
    // Using JavaScript's Date object for simplicity. You might want to use a library like moment.js for more complex operations
    return new Date(dateTimeString).toISOString();
}


const options = {
  key: fs.readFileSync('ssl/svweb.dev.key'),
  cert: fs.readFileSync('ssl/new/8eb5d7f7fac54d65.crt'),
  ca: fs.readFileSync('ssl/new/gd_bundle-g2-g1.crt')
};

https.createServer(options, app).listen(3000, () => console.log('HTTPS Server started on port 3010'));

// app.listen(3000, () => {
//     console.log('Server is running on port 3000');
// });
