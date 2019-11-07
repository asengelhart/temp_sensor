var mysql = require('mysql');
var readline = require('readline');
var rl = readline.createInterface({input:process.stdin, output:process.stdout});
var crypt = require('crypto');

const conn = mysql.createConnection({
    host: "localhost",
    user: "dbuser",
    password: "bleegablarg",
    database: "tempdb"
});

conn.connect((err) => {
    if(err) {throw err;};
    conn.query("CREATE TABLE IF NOT EXISTS users (username VARCHAR(32) PRIMARY KEY, pass BLOB)", 
                   (err, results, fields) => {
       if(err) {
           conn.end();
           throw err;
        }
        conn.query("CREATE TABLE IF NOT EXISTS temps (time BIGINT UNSIGNED PRIMARY KEY, temp FLOAT)", (err, results, fields) => {
            //conn.end();
            if(err) {
                conn.end();
                throw err;
            };
        });
    });
});

/*rl.question('Create a default user for the temp sensor app:', (input) => {
    var username = input;
    rl.question('Create a password for this user: ', (in2) => {
        hash = crypt.createHash('sha256');
        hash.update(in2);
        var passhash = hash.digest();
        try {
            /*conn.connect((err) => {
                if (err) {throw err;};*//*
                var q = "INSERT INTO users SET ?";
                conn.query(q, {username:username, pass:passhash}, (err, results, fields) => {
                   if (err) {throw err;};
                   if (results.affectedRows < 1) {throw new Error("Could not create user");}
                   else {console.log("Success!");};
                });
            //});
        }
        catch(err) {
            console.log(err.message);
        }
        finally {
            conn.end();
        }
    });    
});*/