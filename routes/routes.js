'use strict'

const express = require("express");
const api = express.Router();
const userController = require("../controllers/user.controller");
const autentication = require("../middlewares/authentication");

api.post("/commands", autentication.ensureAuth, userController.commands);

module.exports = api;