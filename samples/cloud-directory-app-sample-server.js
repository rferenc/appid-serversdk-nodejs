/*
 Copyright 2017 IBM Corp.
 Licensed under the Apache License, Version 2.0 (the "License");
 you may not use this file except in compliance with the License.
 You may obtain a copy of the License at
 http://www.apache.org/licenses/LICENSE-2.0
 Unless required by applicable law or agreed to in writing, software
 distributed under the License is distributed on an "AS IS" BASIS,
 WITHOUT WARRANTIES OR CONDITIONS OF ANY KIND, either express or implied.
 See the License for the specific language governing permissions and
 limitations under the License.
 */

const express = require("express");
const session = require("express-session");
const log4js = require("log4js");
const passport = require("passport");
const WebAppStrategy = require("./../lib/appid-sdk").WebAppStrategy;
const helmet = require("helmet");
const bodyParser = require("body-parser"); // get information from html forms
const flash = require("connect-flash");
const app = express();
const logger = log4js.getLogger("cloud-directory-app-sample-server");

const LANDING_PAGE_URL = "/cloud-directory-app-sample.html";
const CALLBACK_URL = "/ibm/bluemix/appid/callback";
const LOGOUT_URL = "/ibm/bluemix/appid/logout";
const ROP_LOGIN_PAGE_URL = "/ibm/bluemix/appid/rop/login";
const ROP_SUBMIT = "/rop/login/submit";
const PROTECTED_ENDPOINT = "/protected";
const SIGN_UP_PAGE = "/ibm/bluemix/appid/view/sign_up";
const FORGOT_PASSWORD_PAGE = "/ibm/bluemix/appid/view/forgot_password";
const ACCOUNT_CONFIRMED_PAGE = "/ibm/bluemix/appid/view/account_confirmed";
const SIGN_UP_SUBMIT = "/sign_up/submit";
const SIGN_UP_SUBMIT_MOBILE = "/sign_up/mobile/submit";
const FORGOT_PASSWORD_SUBMIT = "/forgot_password/submit";
const FORGOT_PASSWORD_SUBMIT_MOBILE = "/forgot_password/mobile/submit";
const RESEND_NOTIFICATION = "/resend_notification";
const GENERAL_ERROR = "GENERAL_ERROR";

const loginEjs = 'cd_login.ejs';
const selfSignUpEjs = 'self_sign_up.ejs';
const selfForgotPasswordEjs = 'self_forgot_password.ejs';
const resetPasswordSentEjs = 'reset_password_sent.ejs';
const thanksForSignUpEjs = 'thanks_for_sign_up.ejs';
const accountConfirmedEjs = 'account_confirmed.ejs';

app.use(helmet());
app.use(flash());
app.set('view engine', 'ejs'); // set up ejs for templating

// Setup express application to use express-session middleware
// Must be configured with proper session storage for production
// environments. See https://github.com/expressjs/session for
// additional documentation
app.use(session({
	secret: "123456",
	resave: true,
	saveUninitialized: true
}));

// Use static resources from /samples directory
app.use(express.static(__dirname ));

// Configure express application to use passportjs
app.use(passport.initialize());
app.use(passport.session());

// Configure passportjs to use WebAppStrategy
passport.use(new WebAppStrategy({
	tenantId: "379c9bd2-8d02-4b5b-83d3-24ad9440a0e3",
	clientId: "dfbd817a-f12e-4d06-9e98-a8863085856b",
	secret: "NTgyMzE5YjctNTM3OS00YWE0LWIzYTItYTc0N2MwNzkxODU1",
	oauthServerUrl: "https://appid-oauth.stage1.eu-gb.bluemix.net/oauth/v3/379c9bd2-8d02-4b5b-83d3-24ad9440a0e3",
	redirectUri: "http://localhost:1234" + CALLBACK_URL
}));

const selfServiceManager = require("./../lib/appid-sdk").selfServiceManager;
selfServiceManager.init({
	iamApiKey: "vtPMY4LXkZWX1FCjRKf7qb1f-yh8y-jDLhTWVMVXJNmA",
	tenantId: "379c9bd2-8d02-4b5b-83d3-24ad9440a0e3",
	managementUrl: "https://appid-management.stage1.eu-gb.mybluemix.net/management/v4/379c9bd2-8d02-4b5b-83d3-24ad9440a0e3"
});

// Configure passportjs with user serialization/deserialization. This is required
// for authenticated session persistence accross HTTP requests. See passportjs docs
// for additional information http://passportjs.org/docs
passport.serializeUser(function(user, cb) {
	cb(null, user);
});
passport.deserializeUser(function(obj, cb) {
	cb(null, obj);
});

app.get(ROP_LOGIN_PAGE_URL, function(req, res) {
	_render(res, loginEjs, {email: req.body && req.body.email}, req.query.language, req.flash('errorCode')[0]);
});

app.post(ROP_SUBMIT, bodyParser.urlencoded({extended: false}), function(req, res, next) {
	passport.authenticate(WebAppStrategy.STRATEGY_NAME, function (err, user, info) {
		if (err) {
			return next(err);
		}
		let language = req.query.language || 'en';
		let languageQuery = '?language=' + language;
		if (!user) {
			req.flash('errorCode', info.code);
			return res.redirect(ROP_LOGIN_PAGE_URL + languageQuery);
		}
		req.logIn(user, function (err) {
			if (err) {
				return next(err);
			}
			return res.redirect(LANDING_PAGE_URL + languageQuery);
		});
	})(req, res, next);
});


// Callback to finish the authorization process. Will retrieve access and identity tokens/
// from App ID service and redirect to either (in below order)
// 1. the original URL of the request that triggered authentication, as persisted in HTTP session under WebAppStrategy.ORIGINAL_URL key.
// 2. successRedirect as specified in passport.authenticate(name, {successRedirect: "...."}) invocation
// 3. application root ("/")
app.get(CALLBACK_URL, passport.authenticate(WebAppStrategy.STRATEGY_NAME));

// Protected area. If current user is not authenticated - redirect to the login widget will be returned.
// In case user is authenticated - a page with current user information will be returned.
app.get(PROTECTED_ENDPOINT, passport.authenticate(WebAppStrategy.STRATEGY_NAME), function(req, res){
	logger.debug("/protected");
	res.json(req.user);
});

// Logout endpoint. Clears authentication information from session
app.get(LOGOUT_URL, function(req, res){
	WebAppStrategy.logout(req);
	res.redirect(LANDING_PAGE_URL);
});


function _generateUserScim(body) {
	let userScim = {};
	userScim.password = body.password;
	userScim.confirmed_password = body.confirmed_password;
	userScim.emails = [];
	userScim.emails[0] = {
		value: body.email,
		primary: true
	};
	if (body.phoneNumber) {
		userScim.phoneNumbers = [];
		userScim.phoneNumbers[0] = {
			value: body.phoneNumber
		};
	}
	if (body.firstName || body.lastName) {
		userScim.name = {};
		if (body.firstName) {
			userScim.name.givenName = body.firstName;
		}
		if (body.lastName) {
			userScim.name.familyName = body.lastName;
		}
	}
	if (body.language) {
		userScim.locale = body.language;
	}
	return userScim;
}

function _render(res, ejs, inputs, language = 'en', errorCode) {
	let languageStrings = require("./translations/" + language);
	let errorMsg = errorCode ? (languageStrings.errors[errorCode] || languageStrings.errors[GENERAL_ERROR]): '';
	if (ejs === selfSignUpEjs) {
		let previousInputs = {
			firstName: inputs.firstName,
			lastName: inputs.lastName,
			phoneNumber: inputs.phoneNumber,
			email: inputs.email,
			message: errorMsg
		};
		Object.assign(languageStrings, previousInputs);
	} else if(ejs === loginEjs) {
		Object.assign(languageStrings, {message: errorMsg});
	} else {
		Object.assign(languageStrings, inputs);
	}
	
	res.render(ejs, languageStrings);
}

//sign up for mobile
app.post(SIGN_UP_SUBMIT_MOBILE, bodyParser.json(), function(req, res) {
	let userData = _generateUserScim(req.body);
	let language = req.query.language;
	selfServiceManager.signUp(userData, language).then(function (user) {
		logger.debug('user created successfully');
		res.status(201).send(user);
	}).catch(function (err) {
		res.status(err && err.code || 500);
		if (err && err.code >= 400 && err.code < 500) {
			logger.debug("bad sign up input: " + err.message);
			res.send(err.message);
		} else {
			logger.error(err);
			res.send('Something went wrong');
		}
	});
});

//sign up for web
app.post(SIGN_UP_SUBMIT, bodyParser.urlencoded({extended: false}), function(req, res) {
	let userData = _generateUserScim(req.body);
	let language = req.query.language || 'en';
	selfServiceManager.signUp(userData, language).then(function (user) {
		_render(res, thanksForSignUpEjs,  {
			displayName: user.displayName ,
			email: user.emails[0].value,
			uuid: user.id
		}, language);
	}).catch(function (err) {
		if (err.code) {
			logger.debug("error code:" + err.code + " ,bad sign up input: " + err.message);
			_render(res, selfSignUpEjs, req.body, req.query.language, err.code);
		} else {
			logger.error(err);
			res.status(500);
			res.send('Something went wrong');
		}
	});
});

app.get(SIGN_UP_PAGE, function(req, res) {
	_render(res, selfSignUpEjs, {}, req.query.language);
});


//forgot password for mobile
app.post(FORGOT_PASSWORD_SUBMIT_MOBILE, bodyParser.json(), function(req, res) {
	let email = req.body && req.body.email;
	let language = req.query.language;
	selfServiceManager.forgotPassword(email, language).then(function (user) {
		logger.debug('forgot password success');
		res.status(202).send(user);
	}).catch(function (err) {
		res.status(err && err.code || 500);
		if (err && err.code >= 400 && err.code < 500) {
			logger.debug("bad input for forgot password: " + err.message);
			res.send(err.message);
		} else {
			logger.error(err);
			res.send('Something went wrong');
		}
	});
});

//forgot password for web
app.post(FORGOT_PASSWORD_SUBMIT, bodyParser.urlencoded({extended: false}), function(req, res) {
	let email = req.body && req.body.email;
	let language = req.query.language;
	selfServiceManager.forgotPassword(email, language).then(function (user) {
		res.render(resetPasswordSentEjs,  {
			displayName: user.displayName ,
			email: user.emails[0].value,
			uuid: user.id
		});
	}).catch(function (err) {
		if (err && err.code >= 400 && err.code < 500) {
			logger.debug("bad input for forgot password: " + err.message);
			_render(res, resetPasswordSentEjs, req.body, req.query.language, err.code);
		} else {
			logger.error(err);
			res.status(500);
			res.send('Something went wrong');
		}
	});
});

app.get(FORGOT_PASSWORD_PAGE, function(req, res) {
	_render(res, selfForgotPasswordEjs, { message: req.flash('error')}, req.query.language);
});

//resend notification endpoint
app.post(RESEND_NOTIFICATION, bodyParser.urlencoded({extended: false}), function(req, res) {
	let uuid = req.body && req.body.uuid;
	let templateName = req.body && req.body.templateName;
	let language = req.query.language || 'en';
	let languageMessages = require("./translations/" + language).messages;
	selfServiceManager.resendNotification(uuid, templateName, language).then(function (success) {
		res.status(200).send(languageMessages.sent);
	}).catch(function (err) {
		if (err.statusCode === 409) {
			logger.debug(err.message);
			res.status(200).send(languageMessages.confirmed);
		} else {
			logger.error(err);
			res.status(200).send(languageMessages.tryLater);
		}
	});
});

app.get(ACCOUNT_CONFIRMED_PAGE, function (req, res) {
	let options = {
		error: req.query.error,
		errorCode: req.query['error_code'],
		errorDescription: req.query['error_description'],
		uuid: req.query.uuid
	};
	_render(res, accountConfirmedEjs, options, req.query.language);
});

var port = process.env.PORT || 1234;
app.listen(port, function() {
	logger.info("Listening on http://localhost:" + port + "/cloud-directory-app-sample.html");
});
