const request = require('request');
const download = require('image-downloader')
var base64Img = require('base64-img');
const express = require('express');
const app = express();
var http = require('http').Server(app);
var io = require('socket.io')(http);
const redis = require('redis');
var cors = require('cors');


const REDIS_PW = 'redis';

//real test
// const REDIS_URL = 'redis';
// const AUTH_URL = 'auth';
// const origin_url = 'http://chat-client.apps.toronto.openshiftworkshop.com'

//local test
const REDIS_URL = 'localhost';
const AUTH_URL = 'localhost';
const origin_url = 'http://localhost:4200';


app.use(cors());
app.use(cors({
    origin: origin_url,
    withCredentials: true
}));

// Server Version
const serverVersion = 'v1';


// Redis
// create and connect redis client to local instance.
const client = redis.createClient(6379, REDIS_URL, {password: REDIS_PW});

const room_name = 'tonronto_cc';
var chat_members = [];
var chat_msgs = [];
client.on('ready', function () {

    console.log('redis connected')
    // Flush Redis DB
    // client.flushdb();

    // Initialize User/Msgs
    client.get(room_name, function (err, reply) {
        if (reply) {
            chat_members = JSON.parse(reply).chat_members;
            chat_msgs = JSON.parse(reply).chat_msgs;
        }
    });
})

// Print redis errors to the console
client.on('error', (err) => {
    console.log("Error " + err);
});


app.get('/login', function (req, res, next) {
    var auth = false;
    var id = req.query.id;
    // var pw = req.query.pw;

    console.log(id + " try to login");

    request('http://' + AUTH_URL + ':8080/auth?id=' + id, {json: true}, (err, res2, body) => {
        if (err) {
            console.log(err);

            res.send({
                'status': 'Auth Server Unavailable',
                'msg': 'Auth Server Unavailable'
            });
        }


        if (res2.statusCode === 503) {
            res.send({
                'status': '503',
                'msg': 'Auth Server Unavailable'
            });
        } else if (res2.statusCode === 504) {
            res.send({
                'status': '504',
                'msg': 'Auth Server Gateway Timeout'
            });
        }
        if (res2.statusCode === 200) {
            auth = true;
        }

        // if (body === 'Auth OK') {
        //     auth = true;
        // }

        if (auth && chat_members.indexOf(id) === -1) {
            chat_members.push(id);

            client.set(room_name, formattedData(chat_members, chat_msgs));
            res.send({
                'chat_members': chat_members,
                'status': 'OK'
            });
        } else {
            res.send({
                'status': 'DUP_NAME',
                'msg': 'DUPLICATE NAME'
            });
        }

        client.get(room_name, function (err, result) {
            console.log(JSON.parse(result));
        });
    });


});


app.get('/join', function (req, res, next) {
    var nickName = req.query.nickName;
    console.log(nickName);
    if (chat_members.indexOf(nickName) === -1) {
        chat_members.push(nickName);
        client.set(room_name, formattedData(chat_members, chat_msgs));

        res.send({
            'chat_members': chat_members,
            'status': 'OK'
        });
    } else {
        res.send({
            'status': 'DUP_NAME',
            'msg': 'DUPLICATE NAME'
        });
    }
    // console.log(chat_members);
    // console.log(chat_msgs);
    client.get(room_name, function (err, result) {
        console.log(JSON.parse(result));
    });
});


app.get('/leave', function (req, res, next) {
    var nickName = req.query.nickName;

    if (chat_members.indexOf(nickName) > -1) {
        chat_members.splice(chat_members.indexOf(nickName), 1);
        client.set(room_name, formattedData(chat_members, chat_msgs));
        console.log('leave: ' + nickName);
        res.send({
            'status': 'OK'
        });
    }
});


app.get('/get_redhat_logo', function (req, res, next) {

    options = {
        url: 'https://connect.redhat.com/sites/all/themes/rhc4tp/dist/images/logo-rh.png',
        dest: __dirname + '/logo-rh.png'
    }

    download.image(options)
        .then(({filename, image}) => {
            console.log('File saved to', filename)
            base64Img.base64(options.dest, function (err, data) {
                res.send(data);
            })

        })
        .catch((err) => {
            console.error(err)
            base64Img.base64('./internet_access_fail.png', function (err, data) {
                res.send(data);
            })

        })

});


io.on('connection', function (socket) {
    console.log('a user connected');

    socket.on('disconnect', function () {
        console.log('user disconnected');
    });

    socket.on('add-message', (nickName, message) => {
        const timeStamp = new Date().getTime();
        chat_msgs.push({sender: nickName, msg: message, date: timeStamp});
        client.set(room_name, formattedData(chat_members, chat_msgs));
        io.emit('message', {

            sender: nickName,
            msg: message,
            date: timeStamp
        });
        client.get(room_name, function (err, result) {
            console.log(JSON.parse(result));
        });

        console.log(message);
    });
});


app.get('/get_messages', function (req, res) {
    console.log("get_messages call");
    console.log(chat_msgs);

    client.get(room_name, function (err, reply) {
        if (reply !== null) {
            chat_msgs = JSON.parse(reply).chat_msgs;
        } else {
            chat_msgs.flush;
        }
    });

    res.send(chat_msgs);
});


app.get('/get_chat_members', function (req, res) {
    res.send(chat_members);
});

app.get('/get_server_version', function (req, res) {
    res.send({"version": serverVersion});
});


app.get('/healthz', function (req, res) {
    console.log("Health check: OK");
    res.send("OK");
});

app.get('/emulate', function (req, res) {
    var client_msg = req.query.client_msg;
    let auth_msg = '';
    let return_msg = 'chat-client(' + client_msg + ') => chat-server => ';
    request('http://' + AUTH_URL + ':8080/auth?id=' + id, {json: true}, (err, res2, body) => {

        if (err) {
            return console.log(err);
        }

        if (res2.statusCode === 503) {
            auth_msg = 'Auth Server - 503 error';
            res.send(return_msg + 'auth(' + auth_msg + ')');
        } else if (res2.statusCode === 504) {
            auth_msg = 'Auth Server - 504 error';
            res.send(return_msg + 'auth(' + auth_msg + ')');
        }
        if (res2.statusCode === 200) {
            auth_msg = '200 ok(' + body + ')';
        }

        if (body === 'Auth OK') {
            client.get(room_name, function (err, result) {
                console.log(JSON.parse(result));
                if (err === null) {
                    res.send(return_msg + 'auth(' + auth_msg + ') => redis(' + err + ')');
                }
            });
        }

    });


    res.send('chat-client(' + client_msg + ') => chat-server => auth(' + auth_msg + ') => redis => chat-server => chat-client');
});

function formattedData(chat_members, chat_msgs) {

    return JSON.stringify({
        "chat_members": chat_members,
        "chat_msgs": chat_msgs
    });
}


// http.listen(8080, '0.0.0.0', function (err) {
http.listen(3000, function (err) {
    // if (err) throw err
    if (err) {
        console.log(err);
    }
    console.log('listening on 0.0.0.0 port 8080')
})
