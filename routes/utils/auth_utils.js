// routes/utils/auth_utils.js
require("dotenv").config();
const axios = require("axios");

function validateUsername(username) {
  if (!/^[A-Za-z]{3,8}$/.test(username)) {
    throw { status: 400, message: "Username must be 3-8 letters only" };
  }
}

function validatePassword(password) {
  if (!/^(?=.*[0-9])(?=.*[^A-Za-z0-9]).{5,10}$/.test(password)) {
    throw {
      status: 400,
      message: "Password must be 5-10 chars, include at least one number and one special char"
    };
  }
}

function validatePasswordConfirmation(password, passwordConfirm) {
  if (password !== passwordConfirm) {
    throw { status: 400, message: "Passwords do not match" };
  }
}

async function validateCountry(country) {
  const response = await axios.get("https://restcountries.com/v3.1/all?fields=name")
  const countries = response.data.map((c) => c.name.common.toLowerCase());
  if (!countries.includes(country.toLowerCase())) {
    throw { status: 400, message: "Invalid country name" };
  }
}

module.exports = {
  validateUsername,
  validatePassword,
  validatePasswordConfirmation,
  validateCountry
};
