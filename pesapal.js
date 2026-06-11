import axios from "axios";

const consumerKey = "qkio1BGGYAXTu2JOfm7XSXNruoZsrqEW";
const consumerSecret = "osGQ364R49cXKeOYSpaOnT++rHs=";

export async function getPesapalToken() {
  try {

    const response = await axios.post(
      "https://pay.pesapal.com/v3/api/Auth/RequestToken",
      {
        consumer_key: consumerKey,
        consumer_secret: consumerSecret
      },
      {
        headers: {
          "Content-Type": "application/json"
        }
      }
    );

    return response.data.token;

  } catch (error) {
    console.log(error.response?.data || error.message);
  }
}