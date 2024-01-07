const axios = require('axios');

class SquareClient {
    constructor(access_token) {
        this.accessToken = access_token;
        this.baseUrl = 'https://connect.squareup.com';
        this.client = axios.create({
            baseURL: this.baseUrl,
            headers: { 'Authorization': `Bearer ${this.accessToken}` },
        });
    }

    async getPaymentDetailsV2(payment_id) {
        try {
            const response = await this.client.get(`/v2/payments/${payment_id}`);
            return response.data;
        } catch (error) {
            console.error('Error in getPaymentDetailsV2:', error);
            throw error; // Or handle as needed
        }
    }

    async getEmployeeInfo(employeeId) {
        try {
            const response = await this.client.get(`/v2/team-members/${employeeId}`);
            return response.data.team_member;
        } catch (error) {
            console.error('Error in getEmployeeInfo:', error);
            throw error; // Or handle as needed
        }
    }

    async getOrderDetails(orderId) {
        try {
            const response = await this.client.get(`/v2/orders/${orderId}`);
            return response.data.order;
        } catch (error) {
            console.error('Error in getOrderDetails:', error);
            throw error; // Or handle as needed
        }
    }

    async getPaymentDetails(paymentId) {
        try {
            const response = await this.client.get(`/v2/payments/${paymentId}`);
            return response.data.payment; 
        } catch (error) {
            console.error('Error in getPaymentDetails:', error);
            throw error; // Or handle as needed
        }
    }
}

module.exports = SquareClient;
