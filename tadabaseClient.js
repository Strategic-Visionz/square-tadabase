const axios = require('axios');

class TadabaseClient {
    constructor(apiKey, appId, appSecret) {
        this.apiKey = apiKey;
        this.appId = appId;
        this.appSecret = appSecret;
        this.baseUrl = 'https://api.tadabase.io/api/v1';
        this.client = axios.create({
            baseURL: this.baseUrl,
            headers: {
                'X-Tadabase-App-id': this.appId,
                'X-Tadabase-App-key': this.apiKey,
                'X-Tadabase-App-secret': this.appSecret,
            },
        });
    }

    async getData(tableId, filters) {
        try {
            // Constructing query parameters for filters
            let queryParams = new URLSearchParams();
            for (let i = 0; i < filters.items.length; i++) {
                const item = filters.items[i];
                queryParams.append(`filters[items][${i}][field_id]`, item.field_id);
                queryParams.append(`filters[items][${i}][operator]`, item.operator);
                queryParams.append(`filters[items][${i}][val]`, item.val);
            }

            const response = await this.client.get(`/data-tables/${tableId}/records?${queryParams.toString()}`);
            return response.data.items; // Assuming the relevant data is in the 'items' key
        } catch (error) {
            console.error('Error fetching filtered data from Tadabase:', error);
            throw error; // Or handle as needed
        }
    }

    async getFilteredData(tableId, params = {}) {
        try {
            const response = await this.client.get(`/data-tables/${tableId}/records`, { params });
            return response.data;
        } catch (error) {
            console.error('Error fetching data from Tadabase:', error);
            throw error;
        }
    }

    async insertData(tableId, data) {
        try {
            const response = await this.client.post(`/data-tables/${tableId}/records`, data);
            return response.data;
        } catch (error) {
            console.error('Error in TadabaseClient insertData:', error);
            throw error;
        }
    }

    // Add more methods as needed for other Tadabase operations
}


module.exports = TadabaseClient;