const request = require('request');
// const bodyPaser = require('body-parser');
const express = require('express');
const app = express();
var http = require('http').Server(app);
var io = require('socket.io')(http);
const redis = require('redis');

const REDIS_URL = 'redis';
const REDIS_PW = 'redis';
const AUTH_URL = 'auth';
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


app.all('/*', function (req, res, next) {
    res.header("Access-Control-Allow-Origin", "*");
    res.header("Access-Control-Allow-Headers", "Origin, X-Requested-With, Content-Type, Accept");
    res.header("Access-Control-Allow-Credentials", "true");
    next();
});


app.get('/login', function (req, res, next) {
    var auth = false;
    var id = req.query.id;
    // var pw = req.query.pw;

    console.log(id + " try to login");

    request('http://' + AUTH_URL + ':8080/auth?id=' + id, {json: true}, (err, res2, body) => {
        if (err) {
            return console.log(err);
        }


        if (res2.statusCode === '503') {
            res.send({
                'status': '503',
                'msg': 'Auth Server Unavailable'
            });
        } else if (res2.statusCode === '504') {
            res.send({
                'status': '504',
                'msg': 'Auth Server Gateway Timeout'
            });
        }
        if (res2.statusCode === '200') {
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
        chat_msgs = JSON.parse(reply).chat_msgs;
    });

    res.send(chat_msgs);
});


app.get('/get_chat_members', function (req, res) {
    res.send(chat_members);
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

        if (res2.statusCode === '503') {
            auth_msg = 'Auth Server - 503 error';
            res.send(return_msg + 'auth(' + auth_msg + ')');
        } else if (res2.statusCode === '504') {
            auth_msg = 'Auth Server - 504 error';
            res.send(return_msg + 'auth(' + auth_msg + ')');
        }
        if (res2.statusCode === '200') {
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


http.listen(8080, '0.0.0.0', function (err) {
    if (err) throw err
    console.log('listening on 0.0.0.0 port 8080')
})
