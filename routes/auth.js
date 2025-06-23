var express = require("express");
var router = express.Router();
const MySql = require("../routes/utils/MySql");
const DButils = require("../routes/utils/DButils");
const bcrypt = require("bcrypt");

const {
  validateUsername,
  validatePassword,
  validatePasswordConfirmation,
  validateCountry
} = require("./utils/auth_utils");

router.post("/register", async (req, res, next) => {
  try {
    const { username, firstname, lastname, country, password, email, profilePic, passwordConfirm } = req.body;

    // Validations
    validateUsername(username);
    validatePassword(password);
    validatePasswordConfirmation(password, passwordConfirm);
    await validateCountry(country);

    const users = await DButils.execQuery("SELECT username FROM users");
    if (users.find((u) => u.username === username)) {
      throw { status: 409, message: "Username taken" };
    }

    const hashed = bcrypt.hashSync(password, parseInt(process.env.bcrypt_saltRounds));
    await DButils.execQuery(
      `INSERT INTO users (username, firstname, lastname, country, password, email, profilePic)
       VALUES (?, ?, ?, ?, ?, ?, ?)`,
      [username, firstname, lastname, country, hashed, email, profilePic]
    );

    res.status(201).send({ message: "User created", success: true });
  } catch (err) {
    next(err);
  }
});


router.post("/login", async (req, res, next) => {
  try {
    // check that username exists
    const users = await DButils.execQuery("SELECT username FROM users");
    if (!users.find((x) => x.username === req.body.username))
      throw { status: 401, message: "Username or Password incorrect" };

    // check that the password is correct
    const user = (
      await DButils.execQuery(
        `SELECT * FROM users WHERE username = '${req.body.username}'`
      )
    )[0];

    if (!bcrypt.compareSync(req.body.password, user.password)) {
      throw { status: 401, message: "Username or Password incorrect" };
    }

    // Set cookie
    req.session.username = user.username; //yuval ; Added this row 
    req.session.user_id = user.user_id
    console.log("session user_id login: " + req.session.user_id);

    // return cookie
    res.status(200).send({ message: "login succeeded " , success: true });
  } catch (error) {
    next(error);
  }
});

router.post("/logout", function (req, res) {
  console.log("session user_id Logout: " + req.session.user_id);
  req.session.reset(); // reset the session info --> send cookie when  req.session == undefined!!
  res.send({ success: true, message: "logout succeeded" });
});


router.get("/isLoggedIn", (req, res) => {
  if (req.session && req.session.user_id) {
    res.status(200).json({ loggedIn: true });
  } else {
    res.status(200).json({ loggedIn: false });
  }
});

module.exports = router;