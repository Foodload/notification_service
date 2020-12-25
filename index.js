const jwt = require('jsonwebtoken');
const express = require('express');
const app = express();
const server = require('http').createServer(app);
var port = process.env.PORT || 3000;
const io = require('socket.io')(server);

const redis = require('redis');
const redisAdapter = require('socket.io-redis');

if (process.env.NODE_ENV != 'production') {
  require('dotenv').config();
}

const User = require('./models/User');

const jwtSecret = process.env.JWT_SECRET;
const redisHost = process.env.REDIS_HOST;
const redisPort = process.env.REDIS_PORT;
const redisPw = process.env.REDIS_PW;

const sub = redis.createClient({
  port: redisPort,
  host: redisHost,
  auth_pass: redisPw,
});

io.adapter(
  redisAdapter({ port: redisPort, host: redisHost, auth_pass: redisPw })
);

server.listen(port, function () {
  console.log('Listening at %d', port);
});

// Serve simple page
app.use(express.static(__dirname + '/public'));

function auth(socket, next) {
  try {
    const decoded = jwt.verify(socket.handshake.query.token, jwtSecret);
    const user = new User(decoded.sub, decoded.family);
    socket.user = user;
    next();
  } catch (error) {
    console.log(error);
    next(new Error('Failed Authentication'));
  }
}

sub.on('subscribe', function (channel, count) {
  console.log('Subscribed to channel: ' + channel + ', count: ' + count);
});

sub.on('message', function (_channel, data) {
  var parsedData;
  try {
    parsedData = JSON.parse(data);
  } catch (error) {
    console.log(error);
    return;
  }

  const messageType = parsedData.messageType;
  if (messageType == 'update_item') {
    io.local.to(parsedData.familyId).emit('update_item', data);
  } else if (messageType == 'family_invite') {
    io.local.to(parsedData.userId).emit('family_invite', data);
  } else if (messageType == 'move_item') {
    io.local.to(parsedData.familyId).emit('move_item', data);
  } else if (messageType == 'delete_item') {
    io.local.to(parsedData.familyId).emit('delete_item', data);
  } else if (messageType == 'change_family') {
    io.local
      .of('/')
      .in(parsedData.userId)
      .clients((error, clients) => {
        if (error) {
          console.log(error);
          return;
        }
        if (clients.length != 0) {
          const socketId = clients[0];
          const socket = io.local.sockets.connected[socketId];
          const user = socket.user;
          socket.leave(user.familyId);
          user.familyId = parsedData.familyId;
          socket.join(user.familyId);
          socket.emit('changed_family'); //add more info?
        }
      });
  }
});

io.use(auth);
io.on('connection', function (socket) {
  const user = socket.user;
  socket.join(user.userId);
  socket.join(user.familyId);

  socket.on('disconnect', function (data) {
    console.log('disconnected');
  });
});

sub.subscribe('PublishItem');
