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
const sub = redis.createClient({ port: redisPort, host: redisHost });

io.adapter(redisAdapter({ port: redisPort, host: redisHost }));

server.listen(port, function () {
  console.log('Listening at %d', port);
});

// Serve simple page...
app.use(express.static(__dirname + '/public'));

function auth(socket, next) {
  try {
    const decoded = jwt.verify(socket.handshake.query.token, jwtSecret);
    const user = new User(decoded.userId, decoded.familyId);
    socket.user = user;
    next();
  } catch (error) {
    next(new Error('Failed Authentication'));
  }
}

sub.on('subscribe', function (channel, count) {
  console.log('Subscribed to channel: ' + channel + ', count: ' + count);
});

sub.on('message', function (channel, data) {
  try {
    data = JSON.parse(data);
  } catch (error) {
    console.log(error);
    return;
  }

  const messageType = data.messageType;
  if (messageType == 'update_item') {
    io.to(data.familyId).emit('update_item', data.data);
  } else if (messageType == 'family_invite') {
    io.to(data.userId).emit('family_invite', data.data);
  }
});

io.use(auth);
io.on('connection', function (socket) {
  const user = socket.user;
  socket.join(user.userId);
  socket.join(user.familyId);

  socket.on('change_family', function (data) {
    var decoded;
    try {
      decoded = jwt.verify(socket.handshake.query.token, jwtSecret);
    } catch (error) {
      socket.emit('error', error.message);
      return;
    }

    socket.leave(user.familyId);
    user.familyId = decoded.familyId;
    socket.join(user.familyId);
    socket.emit('changed_family');
  });

  socket.on('disconnect', function (data) {
    //Nothing needed atm
  });
});

sub.subscribe('foodload');
