/* Backend code for the temp sensor server.
 * This code requires that sensor.py and hvac.py be stored
 * in the same directory as this module (sensor_app.js).
 * Database will need to be set up manually at this time.
 * Requires MySQL installation, which should be available
 * via apt-get or other repository.
 * 
 * Before going into production, change DEVELOPMENT to false
 * and change HAS_GPIO to 1.
 */
const DEVELOPMENT = true;
const HAS_GPIO = 1;

global.__basedir = __dirname;
const url = require('url');

const sqldb = require('mysql');

const port_num = 3306;
const dbname = "tempdb";

const path = require('path');
const express = require('express');
const sessions = require('cookie-session');
const parser = require('body-parser');
const cparser = require('cookie-parser');
const crypt = require('crypto');

const fs = require('fs');
const logfile = path.normalize(__dirname + '/logs/events.log');

const { execFile } = require('child_process');

const SECOND = 1000, MINUTE = 60000, HOUR = 3600000;

//TODO: find better way to do this
global.hvac_on = true;
global.hvac_error = false;
global.min_temp = 70;
global.max_temp = 75;
const MIN_TEMP_LIMIT = 65;
const MAX_TEMP_LIMIT = 80;

function makeCon() {
    return sqldb.createConnection({
        host: "localhost",
        user: "dbuser",
        password: "bleegablarg",
        database: dbname
    });
}


/*
Calls sensor.py, which should return the current temperature
from the sensor as an integer in degrees Celcius * 100, with added final
digit as a 0 or 1 for fan state (total of five digits). 
Temperature is then stored in the temperature database and passed to the callback.
Callback expects arguments (err, temperature), where temperature
is a floating-point number.
This also retrieves the current state of the fan and stores it in
global.hvac_on; this value is currently served to the client via getHvac()

*/
function retrieveCurrentTemp(cb) {
    let temp = -1; //if this value remains unchanged at end, throw error
    scriptname = path.normalize(__dirname + '/sensor.py');
    execFile('python3', [scriptname, HAS_GPIO], (err, stdout, stderr) => {
        if (err) { cb(err); };
        if (stderr) { cb(new Error(stderr)); };

        let data = parseInt(stdout);
        if (data == -1) {
            cb(new Error("There was a problem getting the temperature from the sensor.")); 
        };
        temp = (Math.floor(data / 10) * .018) + 32;
        global.hvac_on = Boolean(data % 10);
        if(data % 10 != 0 || data % 10 != 1) {
            global.hvac_error = true;
        }
        else {
            global.hvac_error = false;
        }
        let rightNow = Date.now();
        let conn = makeCon();
        conn.connect((err) => { 
            if (err) {
                conn.end();
                cb(err);
            }
            conn.query("INSERT INTO temps SET ?", { time: rightNow, temp: temp }, (err, results, fields) => {
                if (err) {
                    conn.end();
                    cb(err);
                }
                else if (results.affectedRows < 1) {
                    if (temp == -100) { 
                        conn.end();
                        cb(new Error("Could not retrieve temperature."));
                    }
                    else { 
                        conn.end();
                        cb(new Error("Could not insert data"));
                    }
                }
                else {
                    cb(null, temp);
                    conn.end();
                }
            });
        });
    });
}

/*Places a log entry into the global log file*/
function logme(message) {
    time_string = new Date(Date.now()).toISOString().slice(0, 16);
    entry = time_string + ": " + message + "\n"
    fs.appendFile(logfile, entry, (err) => {
        if(err){console.log("Unlogged: " + entry)};
    });
}

/*Logs an error in the log file, then calls
  Express error handling.  
  If unable to log, send message to the console, then
  continue handling the original error*/
function log_err(err, req, res, next) {
    message = err.name + ": " + err.stack;
    logme(message);
    next(err);
}
/*
Switches HVAC off if turned on, and vice versa.
Should only be called when we know that we want to switch the HVAC.
hvac.py will return 1 if the unit was successfully toggled.
Any other input should return an error.
*/
function switchHvac(cb) {
    scriptname = "hvac.py";
    execFile('python3', [scriptname, HAS_GPIO], (err, stdout, stderr) => {
        if(err) {cb(err);};
        if(stderr) {cb(stderr);};
        if(stdout != 1) {cb(new Error("HVAC switching reports failure"));};
        global.hvac_on = !global.hvac_on;
        cb(null);
    });
}

function getTempLimits(cb) {
    try{
        let limits = {};
        limits["min_temp"] = global.min_temp;
        limits["max_temp"] = global.max_temp;
        cb(null, limits);
    }
    catch(e){cb(e);}
}

/*
Gets current HVAC status. Works as above, but does not
switch the HVAC on or off.
*/
function getHvac() {
    if(global.hvac_error === true) {
        return "HVAC ERROR";
    }
    if(global.hvac_on === true) {
        return "HVAC is On";
    }
    else {
        return "HVAC is Off";
    }
}

const app = express();

app.use(express.static(__dirname + '/static'));
app.use(cparser());
app.use(parser.json());
//app.use(parser.text({type:'text/plain'}));
app.use(parser.urlencoded({ extended: true }));

/*Session cookie.  Should provide valid login for one hour after closing tab*/
//var MemoryStore = sessions.MemoryStore;
app.use(sessions({
    name: 'session',
    secret: 'aoijeqpoijpoingnw',
    maxAge: 1 * HOUR,
    secure: false,
    httpOnly: false //might not need?
}));
app.use(log_err);

/*Index page.  Redirects to heatgraph if
  if session found, otherwise to login.*/
app.get('/', function(req,res,next) {
    if(req.session.username) {
        res.redirect('/heatgraph');
    }
    else {
       res.redirect('/login');
    }
});

/*Send login page*/
app.get('/login', function (req,res) {
    res.sendFile(__dirname + '/static/login.html');
});

/*If logged in, sends heatgraph.html,
  redirect to login otherwise.*/
app.get('/heatgraph', function (req,res) {
    if(req.session.username) {
        res.sendFile(__dirname + '/static/heatgraph.html');
    }
    else {
        res.redirect('/login');
    }
});

/*Retrieves username and password hash, and if found
  in collection 'users', stores username in session.
  Probably not salty enough.*/
app.post('/login', function(req,res,next) {
    let conn = makeCon();
    conn.connect((err) => { 
        if (err) {
            conn.end();
            next(err); 
        }     
        let username = req.body.username;
        let pass = req.body.pass;
        let hash = crypt.createHash('sha256');
        hash.update(pass);
        let passhash = hash.digest();
        let query = "SELECT * From users WHERE username = ? AND pass = ?";
        conn.query(query, [username, passhash], (err, results, fields) => {
            if (err) { 
                conn.end();
                next(err); 
            }
            else if (results.length < 1) {
                //console.log("Login failed");
                res.status(403).send("Incorrect password or username.");
                conn.end();
            }
            else {
                //console.log("Attempting login for " + username);
                req.session.username = results[0].username;
                if (req.session.username) { 
                    res.redirect("/heatgraph");
                    conn.end();
                }
                else {
                    req.status(500).send("Error starting the session.");
                    conn.end();
                    next(new Error("Error starting the session"));
                }
            }
            //conn.end();
        });
    });
    if (req.session.username) { console.log("User has logged on: " + req.session.username); }
});



app.get('/gettemp', function(req,res,next) {
    let conn = makeCon();
    conn.connect((err) => { 
        if (err) {
            conn.end();
            next(err);
        }
        //logme("Connected to temp db");
        let start = parseInt(req.query.start);
        let end = parseInt(req.query.end);
        if ((start == null || start == undefined) && (end == null || end == undefined)) {
            end = Date.now();
        }
        if ((start == null || start == undefined)) {
            start = start = new Date(end - (MINUTE * 30)).getTime();
        }
        let query = "SELECT * FROM temps WHERE time >= ? AND time <= ?";
        conn.query(query, [start, end], (err, results, fields) => {
            if (err) {
                conn.end();
                next(err);
            }
            else if (results.length < 1) { 
                res.status(404).send("No temperatures found in this range."); 
                conn.end()
            }
            else { 
                res.send(JSON.stringify(results));
                conn.end();
            }
        });
    });
});

app.get('/temp_limits', function(req,res,next) {
    getTempLimits((err,limits) => {
        if(err){next(err);};
        res.send(JSON.stringify(limits));
    });
});

/*Sets temperature limits in accordance to query, provided
  they lie between 65 and 80 Fahrenheit (these limits are
  also hard-coded into the Arduino)*/
app.post('/temp_limits', function(req,res,next) {
    try{
        console.log(req.body.temp_min_input);
        let min = parseInt(req.body.temp_min_input);
        if(min == NaN) {min = global.min_temp;};
        let max = parseInt(req.body.temp_max_input);
        if(max == NaN) {max = global.max_temp;};
        if(min < MIN_TEMP_LIMIT || max > MAX_TEMP_LIMIT){
            throw(new Error("Temperature limits are out of bounds"));
        }
        global.min_temp = min;
        global.max_temp = max;
        getTempLimits((err,limits) => {
            if(err){next(err);};
            res.send(JSON.stringify(limits));
        });
    }
    catch(e){next(e);};
});

/*Checks to ensure it is necessary to change the HVAC status,
  then calls switchHvac if it is.
  Will not call if temp is too low but HVAC is off,
  or if temp is too high but HVAC is on.
  Client can use GET request to see current status*/
app.post('/switch_hvac', function(req,res,next) {
    try {
        retrieveCurrentTemp((err,temp) => {
            if(err){throw(err);};
            if (!(temp < (global.min_temp - 5) && (global.hvac_on == false)) 
             || !(temp > (global.max_temp + 5) && (global.hvac_on == true))) {
                switchHvac((err) => {
                    if(err){throw(err);};
                    res.send(getHvac());
                });
            }
        });
    }
    catch(err) {next(err);}
});

/*Sends current HVAC status as stored in global.hvac_on*/
app.get('/hvac', function(req,res,next) {
    try{res.send(getHvac());}
    catch(e){next(e);}
});

/*Sets temperature limits in accordance to query, provided
  they lie between 65 and 80 Fahrenheit (these limits are
  also hard-coded into the Arduino)*/
app.post('/set_limits', function(req,res,next) {
    try{
        if(req.query.min-temp-input >= 65){
            global.min_temp = req.query.min-temp-input;
        }
        if(req.query.max-temp-input <= 80){
            global.max_temp = req.query.max-temp-input;
        }
    }
    catch(e){next(e);}
});

/*Retrieves and stores the temperature every minute.
  If recorded temperature is outside of set range,
  call switchHvac */
setInterval(() => {
    retrieveCurrentTemp((err, temp) => {
        if(err) {
            console.log("Error: " + err.message);
            logme(err.message);
        }
        if ((temp < global.min_temp && global.hvac_on == true) 
         || (temp > global.max_temp && global.hvac_on == false)) {
                switchHvac((err) => {
                    if(err){logme(err);}
                });
        }
    });    
}, 5 * SECOND);

function start_server() {app.listen(2042, (err) => {
        if (err){
            console.log(err);
            sleep(5 * SECOND);
            start_server();
        }
        else {
            console.log("Server started");
        }
    });
}

start_server();
