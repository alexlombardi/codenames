const { Server } = require("socket.io");
const express = require("express");
const path = require("path");
const bodyParser = require("body-parser");
const cors = require("cors");

const PORT = process.env.PORT || 4000;
//const URL = PORT === 4000 ? "http://localhost:3000" : "https://codenames-2-ee8548c59ac1.herokuapp.com/" + PORT;

const exp = express();
exp.use(cors());
const httpServer = exp.listen(PORT, () => {
    console.log(`Server listening on ${PORT}`);
});

const io = new Server(httpServer/*, {
    cors: {
        origin: URL,
        methods: ["GET", "POST"]
    }
}*/);

exp.use(bodyParser.urlencoded({ extended: false }));
exp.use(bodyParser.json({limit: '50mb'}));
exp.use(express.static(path.resolve(__dirname, '../client/build')));

exp.get('/', (req, res) => {
    res.sendFile(path.resolve(__dirname, '../client/build', 'index.html'));
});

var users = {};

var rooms = {};

io.on("connection", (socket) => {
    console.log("a user connected");
    console.log(socket.id);

    socket.on('disconnecting', () => {
        //delete player from room on disconnect, delete room if empty
        for (const room of socket.rooms) {
            if (rooms.hasOwnProperty(room)) {
                delete rooms[room].players[socket.id];
                console.log('Player deleted from room ' + room);
                io.in(room).emit('players', rooms[room].players);
                if (Object.keys(rooms[room].players).length === 0) {
                    delete rooms[room];
                    console.log('Room deleted: ' + room);
                }
            }
        }
    });

    //disconnect
    socket.on("disconnect", () => {
        console.log("user disconnected");
    });

    //receive login textbox input from client
    socket.on('loginInput', (data) => {
        if (data.username !== '') {
            if (users[data.username] === undefined) {
                if (data.password.length < 8) { //username does not exist, password is too short
                    socket.emit('loginApprovalText', 'Username does not exist. Password must be at least 8 characters long to create a new account.');
                } else {
                    socket.emit('loginApprovalText', 'Hit enter to create a new account!');
                }
            } else {
                if (users[data.username].password === data.password) { //username exists, password is correct
                    socket.emit('loginApprovalText', 'Hit enter to log in!');
                } else { //username exists, password is incorrect
                    socket.emit('loginApprovalText', 'Found user - incorrect password.');
                }
            }
        } else {
            socket.emit('loginApprovalText', '');
        }
    });

    //receive login submit from client
    socket.on('loginSubmit', (data) => {
        if (data.username !== '') {
            if (users[data.username] === undefined) {
                if (data.password.length >= 8) {
                    var hue = Math.floor(Math.random() * 360);
                    //create new account
                    users[data.username] = {
                        username: data.username,
                        password: data.password,
                        color: `hsl(${hue}, 60%, 45%)`,
                        icon: '',
                        wins: 0,
                        personalHistory: [],
                        globalHistory: []
                    };
                    console.log('New account created');
                    console.log(users[data.username]);
                    socket.emit('loggedInAs', users[data.username]);
                    socket.emit('loginApprovalText', '');
                }
            } else {
                //log in
                if (users[data.username].password === data.password) {
                    socket.emit('loggedInAs', users[data.username]);
                    socket.emit('loginApprovalText', '');
                }
            }
        }
    });

    //receive user refresh request from client
    socket.on('userRefresh', (data) => {
        //socket.emit('loggedInAs', users[data]);
    });

    //receive room textbox input from client
    socket.on('roomInput', (data) => {
        if (rooms.hasOwnProperty(data)) {
            socket.emit('loginApprovalText', 'Room has ' + Object.keys(rooms[data].players).length + ' players. Hit enter to join!');
        } else {
            socket.emit('loginApprovalText', 'Hit enter to create a new room!');
        }
    });

    //receive room join request from client
    socket.on('roomJoin', (data) => {
        socket.join(data.room);
        //re-create user if they are not in the users object
        if (users[data.user.username] === undefined) {
            var hue = Math.floor(Math.random() * 360);
            users[data.user.username] = data.user;
        }
        console.log(rooms);
        //JOIN EXISTING ROOM
        if (rooms.hasOwnProperty(data.room)) {
            //socket.emit('roomJoined', data.room);
        //CREATE NEW ROOM
        } else {
            rooms[data.room] = {
                players: {},
                cards: [],
                turn: 'red',
                started: false,
                clue: '',
                clueNumber: 0,
                flipCount: 0,
                winner: '',
                teams: [
                    {
                        color: 'red',
                        name: 'Red Team',
                        players: []
                    }, 
                    {
                        color: 'blue',
                        name: 'Blue Team',
                        players: []
                    }
                ]
            };
            //populate cards array
            for (let i = 0; i < 25; i++) {
                rooms[data.room].cards[i] = {
                    text: '',
                    color: 'rgb(180, 208, 240)',
                    backColor: null,
                    flipped: true,
                    type: 'neutral'
                };
            }
            var coinFlip = Math.floor(Math.random() * 2);
            if (coinFlip === 0) {
                rooms[data.room].turn = 'blue';
            }
            for (let i = 0; i < 8 + coinFlip; i++) {
                rooms[data.room].cards[i].type = 'red';
            }
            for (let i = 16; i < 25 - coinFlip; i++) {
                rooms[data.room].cards[i].type = 'blue';
            }
            rooms[data.room].cards[12].type = 'bomb';
            rooms[data.room].cards.sort(() => Math.random() - 0.5);
        }
        //add player
        var player = {
            id: socket.id,
            username: data.user.username,
            color: data.user.color,
            x: 0,
            y: 0,
            team: ''
        };

        // add player to the team with the fewest players
        let minPlayers = rooms[data.room].teams[0].players.length;
        let teamIndex = 0;
        for (let i = 1; i < rooms[data.room].teams.length; i++) {
            if (rooms[data.room].teams[i].players.length < minPlayers) {
                minPlayers = rooms[data.room].teams[i].players.length;
                teamIndex = i;
            }
        }
        rooms[data.room].teams[teamIndex].players.push(player.id);
        player.team = rooms[data.room].teams[teamIndex].color;
        //add player to room
        rooms[data.room].players[socket.id] = player;
        //send room to new client
        socket.emit('room', data.room);
        //send cards to new client
        socket.emit('cards', rooms[data.room].cards);
        //send started to new client
        socket.emit('startGame', rooms[data.room].started);
        //send turn to new client
        socket.emit('turn', rooms[data.room].turn);
        //send clue to new client
        socket.emit('clue', {clue: rooms[data.room].clue, number: rooms[data.room].clueNumber});
        //send flip count to new client
        socket.emit('flipCount', rooms[data.room].flipCount);
        //send winner to new client
        socket.emit('winner', rooms[data.room].winner);
        //send teams and players to everyone when client joins
        io.in(data.room).emit('teamsAndPlayers', {teams: rooms[data.room].teams, players: rooms[data.room].players});
    });

    //receive card change from client
    socket.on('cardChange', (data) => {
        rooms[data.room].cards = data.cards;
        io.in(data.room).emit('cards', rooms[data.room].cards);
    });

    //receive card flip from client
    socket.on('cardFlip', (data) => {
        rooms[data.room].flipCount += 1;
        rooms[data.room].cards[data.index].flipped = data.value;
        //flip count exceeds clue number, end turn
        if (rooms[data.room].flipCount > rooms[data.room].clueNumber && rooms[data.room].clueNumber !== 0) {
            rooms[data.room].clue = '';
            rooms[data.room].clueNumber = 0;
            rooms[data.room].flipCount = 0;
            rooms[data.room].turn === 'red' ? rooms[data.room].turn = 'blue' : rooms[data.room].turn = 'red';
            io.in(data.room).emit('clue', {clue: '', number: 0});
        } else {
            //change turn if other team's card or neutral card is flipped
            if (rooms[data.room].cards[data.index].type !== rooms[data.room].turn) {
                rooms[data.room].clue = '';
                rooms[data.room].clueNumber = 0;
                rooms[data.room].flipCount = 0;
                rooms[data.room].turn === 'red' ? rooms[data.room].turn = 'blue' : rooms[data.room].turn = 'red';
                io.in(data.room).emit('clue', {clue: '', number: 0});
            }
        }
        //declare winner if all red or all blue cards are flipped
        var redCount = 0;
        var blueCount = 0;
        for (let i = 0; i < rooms[data.room].cards.length; i++) {
            if (rooms[data.room].cards[i].type === 'red' && rooms[data.room].cards[i].flipped) {
                redCount += 1;
            } else if (rooms[data.room].cards[i].type === 'blue' && rooms[data.room].cards[i].flipped) {
                blueCount += 1;
            }
        }
        if (redCount === 0) {
            rooms[data.room].winner = 'red';
            io.in(data.room).emit('winner', rooms[data.room].winner);

        } else if (blueCount === 0) {
            rooms[data.room].winner = 'blue';
            io.in(data.room).emit('winner', rooms[data.room].winner);
        }
        //update
        io.in(data.room).emit('flipCount', rooms[data.room].flipCount);
        io.in(data.room).emit('turn', rooms[data.room].turn);
        io.in(data.room).emit('cardFlip', {index: data.index, value: data.value});
    });

    //receive prompt from client
    socket.on('prompt', (data) => {
        for (let i = 0; i < rooms[data.room].cards.length; i++) {
            if (rooms[data.room].cards[i].text === '') {
                rooms[data.room].cards[i].text = data.prompt;
                rooms[data.room].cards[i].backColor = data.color;
                io.in(data.room).emit('cards', rooms[data.room].cards);
                return;
            }
        }
    });

    //receive mouse move from client
    socket.on('mouseMove', (data) => {
        if (rooms[data.room]) {
            if (rooms[data.room].players[socket.id] === undefined) {
                return;
            }
            rooms[data.room].players[socket.id].x = data.x;
            rooms[data.room].players[socket.id].y = data.y;
            io.in(data.room).emit('players', rooms[data.room].players);
        }
    });

    //receive mouse click from client
    socket.on('mouseClick', (data) => {
        io.in(data.room).emit('mouseClick', data);
    });

    //receive start game from client
    socket.on('startGame', (data) => {
        for (card of rooms[data.room].cards) {
            card.backColor = null;
        }
        io.in(data.room).emit('cards', rooms[data.room].cards);
        rooms[data.room].started = true;
        io.in(data.room).emit('startGame', true);
    });

    //receive switch team from client
    socket.on('switchTeam', (data) => {
        var destinationTeam = data.destinationTeam === 'red' ? 0 : 1;
        var sourceTeam = data.sourceTeam === 'red' ? 0 : 1;
        rooms[data.room].teams[sourceTeam].players.splice(rooms[data.room].teams[sourceTeam].players.indexOf(socket.id), 1);
        rooms[data.room].teams[destinationTeam].players.splice(0, 0, socket.id);
        rooms[data.room].players[socket.id].team = data.destinationTeam;

        io.in(data.room).emit('teams', rooms[data.room].teams);
        io.in(data.room).emit('players', rooms[data.room].players);
    });

    //receive clue from client
    socket.on('clue', (data) => {
        rooms[data.room].clue = data.clue;
        const clueNumber = data.clue.match(/\d+/);
        rooms[data.room].clueNumber = clueNumber ? parseInt(clueNumber[0]) : 0;
        io.in(data.room).emit('clue', {clue: data.clue, number: rooms[data.room].clueNumber});
    });

    //receive winner from client
    socket.on('winner', (data) => {
        rooms[data.room].winner = data.winner;
        io.in(data.room).emit('winner', data.winner);
    });

    //receive end turn from client
    socket.on('endTurn', (data) => {
        rooms[data.room].turn === 'red' ? rooms[data.room].turn = 'blue' : rooms[data.room].turn = 'red';
        rooms[data.room].clue = '';
        rooms[data.room].clueNumber = 0;
        rooms[data.room].flipCount = 0;
        io.in(data.room).emit('turn', rooms[data.room].turn);
        io.in(data.room).emit('clue', {clue: '', number: 0});
        io.in(data.room).emit('flipCount', 0);
    });

    //receive leave room from client
    socket.on('leaveRoom', (data) => {
        socket.leave(data.room);
        delete rooms[data.room].players[socket.id];
        io.in(data.room).emit('players', rooms[data.room].players);
        socket.emit('room', '');
        //remove from team
        for (let i = 0; i < rooms[data.room].teams.length; i++) {
            if (rooms[data.room].teams[i].players.includes(socket.id)) {
                rooms[data.room].teams[i].players.splice(rooms[data.room].teams[i].players.indexOf(socket.id), 1);
            }
        }
        io.in(data.room).emit('teams', rooms[data.room].teams);
        //delete room if empty
        if (Object.keys(rooms[data.room].players).length === 0) {
            console.log('Room deleted: ' + data.room);
            delete rooms[data.room];
        }
    });

    //receive reset from client
    socket.on('reset', (data) => {
        rooms[data.room].started = false;
        rooms[data.room].clue = '';
        rooms[data.room].clueNumber = 0;
        rooms[data.room].flipCount = 0;
        rooms[data.room].winner = ''
        //populate cards array
        for (let i = 0; i < 25; i++) {
            rooms[data.room].cards[i] = {
                text: '',
                color: 'rgb(180, 208, 240)',
                backColor: null,
                flipped: true,
                type: 'neutral'
            };
        }
        var coinFlip = Math.floor(Math.random() * 2);
        if (coinFlip === 0) {
            rooms[data.room].turn = 'blue';
        }
        for (let i = 0; i < 8 + coinFlip; i++) {
            rooms[data.room].cards[i].type = 'red';
        }
        for (let i = 16; i < 25 - coinFlip; i++) {
            rooms[data.room].cards[i].type = 'blue';
        }
        rooms[data.room].cards[12].type = 'bomb';
        rooms[data.room].cards.sort(() => Math.random() - 0.5);
        //send cards
        io.in(data.room).emit('cards', rooms[data.room].cards);
        //send started
        io.in(data.room).emit('startGame', rooms[data.room].started);
        //send turn
        io.in(data.room).emit('turn', rooms[data.room].turn);
        //send clue
        io.in(data.room).emit('clue', {clue: rooms[data.room].clue, number: rooms[data.room].clueNumber});
        //send flip count
        io.in(data.room).emit('flipCount', rooms[data.room].flipCount);
        //send winner
        io.in(data.room).emit('winner', rooms[data.room].winner);
        //send reset
        io.in(data.room).emit('reset', '')
    });
});