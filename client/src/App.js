import './App.css';
import { useState, useEffect } from 'react';
import React from 'react';
import * as ReactDOMServer from "react-dom/server";
import { ReactFitty } from 'react-fitty';
import { socket } from './socket';
import chroma, { scale } from 'chroma-js';
import Icon from '@mdi/react';
import { mdiBomb, mdiCrownCircleOutline, mdiStar } from '@mdi/js';

const defaultStrings = [
    'apple', 'berry', 'charm', 'delta', 'eagle', 'flame', 'grape', 'honey', 'ivory', 'jolly', 'karma', 'lemon', 'mango', 'noble', 'olive', 'pearl', 'quilt', 'raven', 'sugar', 'tiger', 'ultra', 'vivid', 'whale', 'xenon', 'yacht'
]

var animations = [...Array(25)].map(() => { return {} });
           
function mod(n, m) {
    return ((n % m) + m) % m;
}

function App() {
    const debug = 0;
    const colorScale = chroma.scale(['rgb(255, 0, 0)', 'rgb(0, 0, 255)']);
    const [targetPrimary, setTargetPrimary] = useState(colorScale(0.5).hex());
    const [interfaceScale, setInterfaceScale] = useState(1);
    const [primaryColor, setPrimaryColor] = useState(targetPrimary);
    const [colorAnimationTimestamp, setColorAnimationTimestamp] = useState(0);
    const [cards, setCards] = useState([]);
    const [players, setPlayers] = useState({});
    const [room, setRoom] = useState('');
    const [teams, setTeams] = useState([]);
    const [loggedInAs, setLoggedInAs] = useStickyState('', 'loggedInAs');
    const [loginApprovalText, setLoginApprovalText] = useState('');
    const [turn, setTurn] = useState('');
    const [started, setStarted] = useState(false);
    const [clue, setClue] = useState('');
    const [clueNumber, setClueNumber] = useState(0);
    const [flipCount, setFlipCount] = useState(0);
    const [winner, setWinner] = useState('');
    var cardH = 150;
    var columnCount = Math.ceil(window.innerHeight / cardH) + 1;
    cardH = window.innerHeight / columnCount;
    columnCount += 1;
    var singleColumn = [...Array(columnCount)].map(() => {
        return {
            text: '',
            x: 0,
            y: 0,
            z: 0,
            rotation: 0
        }
    });
    const [cardColumns, setCardColumns] = useState([JSON.parse(JSON.stringify(singleColumn)), JSON.parse(JSON.stringify(singleColumn))]);
    const [transforms, setTransforms] = useState([...Array(25)].map(() => { 
        return {
            rotationX: 0,
            rotationY: 0,
            offsetX: 0,
            offsetY: 0,
            scale: 1
        }
    }));

    function useStickyState(defaultValue, key) {
        const [value, setValue] = React.useState(() => {
            const stickyValue = window.localStorage.getItem(key);
            return stickyValue !== null
                ? JSON.parse(stickyValue)
                : defaultValue;
        });
        React.useEffect(() => {
            window.localStorage.setItem(key, JSON.stringify(value));
        }, [key, value]);
        return [value, setValue];
    }

    //at start
    useEffect(() => {
        //resize card container
        function scaleInterface() {
            var elements = document.getElementsByClassName('gameScreen');
            if (elements.length === 0) { return };
            var screen = elements[0];
            var scale = Math.min(window.innerWidth / screen.offsetWidth, window.innerHeight / screen.offsetHeight, 1);
            setInterfaceScale(scale);
            screen.style.transform = 'scale(' + scale + ')';
            screen.style.left = ((window.innerWidth - (1920 * scale)) / 2) + 'px';
            screen.style.marginLeft = -((1920 - (1920 * scale)) / 2) + 'px';
            screen.style.marginTop = -((1080 - (1080 * scale)) / 2) + 'px';
            //screen.style.marginTop = -((window.innerHeight - (1080 * scale)) / 2) + 'px';
        }
        window.onload = () => {
            scaleInterface();
        }
        window.onresize = () => {
            scaleInterface();
        }

        //on disconnect, reset everything to default
        socket.on('disconnect', () => {
            setCards([]);
            setPlayers({});
            setRoom('');
            setTeams([]);
            setLoginApprovalText('');
            setTurn('');
            setStarted(false);
            setTransforms([...Array(25)].map(() => { 
                return {
                    rotationX: 0,
                    rotationY: 0,
                    offsetX: 0,
                    offsetY: 0,
                    scale: 1
                }
            }));
        });

        //get updated user info if logged in
        if (loggedInAs !== '') {
            socket.emit('userRefresh', loggedInAs.username);
        }

        //set up receiving login approval text from server
        socket.on('loginApprovalText', (data) => {
            setLoginApprovalText(data);
        });

        //set up receiving loggedInAs from server
        socket.on('loggedInAs', (data) => {
            setLoggedInAs(data);
        });

        //set up receiving cards from server
        socket.on('cards', (data) => {
            setCards(cards => {
                for (let i = 0; i < cards.length; i++) {
                    if (!cards[i]) {return};
                    if (!data[i]) {return};
                    if (cards[i].backColor !== data[i].backColor && cards.some(card => card.text === '')) {
                        changeBackColor(i, data[i].backColor);
                    }
                }

                return data;
            })
        });

        //set up receiving card flip from server
        socket.on('cardFlip', (data) => {
            setCards(cards => {
                //flip card
                cards[data.index].flipped = data.value;
                //update primary color
                var redFlipped = cards.filter(card => card.type === 'red' && !card.flipped).length;
                var blueFlipped = cards.filter(card => card.type === 'blue' && !card.flipped).length;
                var scaleBalance = 0.5 - Math.min(3, Math.max(-3, redFlipped - blueFlipped)) / 6;
                var newPrimaryColor = colorScale(scaleBalance).hex();
                //bomb
                if (cards[data.index].type === 'bomb') {
                    newPrimaryColor = '#181818';
                    var cardElements = document.getElementsByClassName('card');
                    var cardElement = cardElements[data.index];
                    var cardRect = cardElement.getBoundingClientRect();
                    var cardCenterX = cardRect.left + (cardRect.width / 2);
                    var cardCenterY = cardRect.top + (cardRect.height / 2);
                    bombExplode(cardCenterX, cardCenterY);
                    cards.forEach((card, i) => {
                        card.color = 'black';
                    })
                    //winner
                    setRoom(room => {
                        socket.emit('winner', {winner: turn === 'red' ? 'blue' : 'red', room: room});
                        return room;
                    })
                }
                setTargetPrimary(newPrimaryColor);
                setColorAnimationTimestamp(performance.now());
                const root = document.querySelector('#root');
                root.style.setProperty('--primary-color', colorScale(scaleBalance).hex());
                return [...cards]
            });
            var cardElements = document.getElementsByClassName('card');
            var cardElement = cardElements[data.index];
            unflipCard(cardElement, data.index);
        });

        //set up receiving players from server
        socket.on('players', (data) => {
            setPlayers(data);
        });

        //set up receiving turn from server
        socket.on('turn', (data) => {
            setTurn(data);
        });

        //set up receiving teams from server
        socket.on('teams', (data) => {
            setTeams(data);
        });

        //set up receiving combo teams and players from server
        socket.on('teamsAndPlayers', (data) => {
            setPlayers(data.players);
            setTeams(data.teams);
        });

        //set up receiving game start from server
        socket.on('startGame', (data) => {
            setStarted(data);
        });

        //set up receiving clue from server
        socket.on('clue', (data) => {
            setClue(data.clue);
            setClueNumber(data.number);
        });

        //set up receiving flip count from server
        socket.on('flipCount', (data) => {
            setFlipCount(data);
        });

        socket.on('winner', (data) => {
            setWinner(data);
            setCards(cards => {
                if (data !== '' && cards.find(card => card.type === 'bomb' && card.flipped)) {
                    setTargetPrimary(data === 'red' ? 'rgb(255, 0, 0)' : 'rgb(0, 0, 255)');
                    setColorAnimationTimestamp(performance.now());
                    var overlay = document.getElementsByClassName('victoryOverlay')[0];
                    overlay.style.backgroundColor = data === 'red' ? 'rgb(255, 0, 0)' : 'rgb(0, 0, 255)';
                    overlay.style.opacity = 1;
                }
                return cards;
            })
        });

        socket.on('reset', (data) => {
            const colorScale = chroma.scale(['rgb(255, 0, 0)', 'rgb(0, 0, 255)']);
            setTargetPrimary(colorScale(0.5).hex());
            setColorAnimationTimestamp(performance.now());
            const root = document.querySelector('#root');
            root.style.setProperty('--primary-color', colorScale(0.5).hex());
            var overlay = document.getElementsByClassName('victoryOverlay')[0];
            overlay.style.opacity = 0;
        });

        //set up receiving room from server
        socket.on('room', (data) => {
            //scale
            scaleInterface();
            setRoom(data);

            //set up receiving mouse click from server
            socket.on('mouseClick', (data) => {
                setInterfaceScale(scale => {
                    //click ripple
                    var elements = document.getElementsByClassName('cardContainer');
                    if (elements.length === 0) { return };
                    var cardContainer = elements[0].getBoundingClientRect();
                    const cardsElements = document.getElementsByClassName('card');
                    elements = document.getElementsByClassName('gameScreen');
                    if (elements.length === 0) { return };
                    var screen = elements[0].getBoundingClientRect();
                    for (let i = 0; i < cardsElements.length; i++) {
                        if (!animations[i].clickRipple) {
                            const cardElement = cardsElements[i];
                            const cardRect = cardElement.getBoundingClientRect();
                            const cardCenterX = cardRect.left + (cardRect.width / 2);
                            const cardCenterY = cardRect.top + (cardRect.height / 2);
    
                            animations[i].clickRipple = { 
                                startX: 0, 
                                startY: 0, 
                                endX: (cardCenterX - ((data.x * scale) + screen.left)) / 20, 
                                endY: (cardCenterY - ((data.y * scale) + screen.top)) / 20, 
                                startTime: null, 
                                duration: 650 
                            }
                        }
                    }
                    //click circle
                    var clickCircle = document.createElement('div');
                    clickCircle.className = 'clickCircle';
                    clickCircle.style.left = `${(data.x * scale) + screen.left}px`;
                    clickCircle.style.top = `${(data.y * scale) + screen.top}px`;
                    clickCircle.style.backgroundColor = data.color;
                    document.getElementsByClassName('App')[0].appendChild(clickCircle);
                    setTimeout(() => {
                        clickCircle.remove();
                    }, 500);
                    return scale;
                })
            });

            //animation
            let lastTime = 0;
            function animate(time) {
                if (!lastTime) lastTime = time;
                const deltaTime = time - lastTime;
                lastTime = time;

                const cardsElements = document.getElementsByClassName('card');
                for (let i = 0; i < cardsElements.length; i++) {
                    const cardElement = cardsElements[i];
                    const cardRect = cardElement.getBoundingClientRect();
                    const cardCenterX = cardRect.left + (cardRect.width / 2);
                    const cardCenterY = cardRect.top + (cardRect.height / 2);
                    //wobble
                    const wobbleY = (Math.sin(time / 240 + (i * 1.5)) * 10).toFixed(2);

                    //click ripple
                    let clickRippleX = 0;
                    let clickRippleY = 0;
                    if (animations[i] && animations[i].clickRipple) {
                        const { startX, startY, endX, endY, duration } = animations[i].clickRipple;
                        if (!animations[i].clickRipple.startTime) {
                            animations[i].clickRipple.startTime = time;
                        }
                        const startTime = animations[i].clickRipple.startTime;
                        const elapsed = time - startTime;
                        const progress = Math.min(elapsed / duration, 1);
                        const easing = (t) => Math.sin(t * Math.PI); // smooth curve back to 0
                        const easedProgress = easing(progress);

                        clickRippleX = startX + (endX - startX) * easedProgress;
                        clickRippleY = startY + (endY - startY) * easedProgress;

                        //const angle = Math.atan2(endY - startY, endX - startX) * (180 / Math.PI);

                        if (progress >= 1) {
                            delete animations[i].clickRipple;
                        }
                    }

                    //add everything together
                    transforms[i].rotationX = 0;
                    transforms[i].rotationY = wobbleY;
                    transforms[i].offsetX = clickRippleX;
                    transforms[i].offsetY = clickRippleY;
                }

                //card column
                setCardColumns(cardColumns => {
                    for (let i = 0; i < cardColumns.length; i++) {
                        for (let j = 0; j < cardColumns[i].length; j++) {
                            /*cardColumns[i][j].x = (Math.floor(Math.sin(time / 300) * 150 + Math.sin(time / 150 + j) * 75)) * 1.8;
                            cardColumns[i][j].rotation = Math.floor(Math.sin(time / 300) * 150 + Math.sin(time / 150 + j) * 75) / 6;
                            cardColumns[i][j].y = mod(((time / 600) * cardH + 500 * i) + (j * cardH), window.innerHeight + cardH) - cardH;*/
                            cardColumns[i][j].x = (Math.floor(Math.sin(time / 600) * 150 + Math.sin(time / 300 + j) * 75)) * 1.8;
                            cardColumns[i][j].rotation = (((time / 40) - j * 20) % 180);
                            cardColumns[i][j].y = mod(((time / 600) * cardH + 500 * i) + (j * cardH), window.innerHeight + cardH) - cardH;
                        }
                    }
                    return [...cardColumns]
                })

                //animate color change
                    setColorAnimationTimestamp(colorAnimationTimestamp => {
                        console.log(time - colorAnimationTimestamp)
                        if (time - colorAnimationTimestamp <= 3000) {
                            setTargetPrimary(targetPrimary => {
                                setPrimaryColor(primaryColor => {
                                    const colorScale = chroma.scale([primaryColor, targetPrimary]);
                                    return colorScale((time - colorAnimationTimestamp) / 3000).hex()
                                })
                                return targetPrimary;
                            })
                        }
                        return colorAnimationTimestamp;
                    })

                setTransforms([...transforms]);
                requestAnimationFrame(animate);
            }

            requestAnimationFrame(animate);
        });
    }, []);

    //apply animations
    useEffect(() => {
        const cardsElements = document.getElementsByClassName('card');
        if (cards.length !== cardsElements.length) { return };
        for (let i = 0; i < cardsElements.length; i++) {
            const element = cardsElements[i];
            element.style.transform = `translateX(${transforms[i].offsetX}px) translateY(${transforms[i].offsetY}px) rotateX(${transforms[i].rotationX}deg) rotateY(${(Number(transforms[i].rotationY) + Number(cards[i].flipped ? 180 : 0))}deg)`;
        }
    }, [transforms, cards]);
    //card columns
    useEffect(() => {
        //console.log(cardColumns)
        var columns = document.getElementsByClassName('cardColumn');
        if (columns.length === 0) { return };
        for (let i = 0; i < columns.length; i++) {
            var elements = columns[i].getElementsByClassName('cardColumnCard');
            if (elements.length === 0) { return };
            for (let j = 0; j < elements.length; j++) {
                elements[j].style.transform = `rotateY(${cardColumns[i][j].rotation}deg)`;
                //randomize text
                if (cardColumns[i][j].y <= 0 - cardH + 1) {
                    elements[j].innerHTML = defaultStrings[Math.floor(Math.random() * defaultStrings.length)].toUpperCase();
                }
            }
            var containers = columns[i].getElementsByClassName('cardColumn3dContainer');
            if (containers.length === 0) { return };
            for (let j = 0; j < containers.length; j++) {
                containers[j].style.transform = `translate3d(${cardColumns[i][j].x}px, ${cardColumns[i][j].y}px, ${cardColumns[i][j].z}px)`;
            }
        }
    }, [cardColumns])


    //when cards array changes
    /*useEffect(() => {
        //animate cards
        var cardsElements = document.getElementsByClassName('card');
        for (let i = 0; i < cardsElements.length; i++) {
            if (cards[i].animation === 'none') {
                cardsElements[i].animate([
                    {transform: 'rotateY(0deg)'},
                    {transform: 'rotateY(360deg)'}
                ], {
                    duration: 3000,
                    repeat: 3,
                    fill: 'forwards',
                    easing: 'linear',
                    iterations: Infinity
                });
                cards[i].animation = 'rotate';
                socket.emit('cardChange', {cards: cards, room: room});
            }
        }
    }, [cards])*/

    function loginSubmit(event) {
        if (event.key === 'Enter') {
            socket.emit('loginSubmit', { username: document.getElementsByClassName('usernameInput')[0].value, password: document.getElementsByClassName('passwordInput')[0].value });
        }
    }

    function roomJoin(event) {
        if (event.key === 'Enter') {
            socket.emit('roomJoin', { room: document.getElementsByClassName('roomInput')[0].value, user: loggedInAs });
            setLoginApprovalText('');
        }
    }

    function flipCard(target, i) {
        socket.emit('sendAnimation', { animation: 'flipCard', cardIndex: i });
        
        let startTime;
        const duration = 300;
        const startRotation = 0;
        const endRotation = 180;

        function animate(time) {
            if (!startTime) startTime = time;
            const elapsed = time - startTime;
            const progress = Math.min(elapsed / duration, 1);
            const currentRotation = startRotation + (endRotation - startRotation) * progress;

            target.style.transform = `rotateY(${currentRotation}deg)`;

            if (progress < 1) {
                requestAnimationFrame(animate);
            }
        }

        requestAnimationFrame(animate);
    }

    function unflipCard(target, i) {
        socket.emit('sendAnimation', { animation: 'unflipCard', cardIndex: i });

        let startTime;
        const duration = 300;
        const startRotation = 180;
        const endRotation = 0;

        function animate(time) {
            if (!startTime) startTime = time;
            const elapsed = time - startTime;
            const progress = Math.min(elapsed / duration, 1);
            const currentRotation = startRotation + (endRotation - startRotation) * progress;

            target.style.transform = `rotateY(${currentRotation}deg)`;

            if (progress < 1) {
                requestAnimationFrame(animate);
            }
        }

        requestAnimationFrame(animate);
    }

    function themeColor(saturation, lightness) {
        var hsl = chroma(primaryColor).hsl();
        var hue = hsl[0];
        if (isNaN(hue)) { hue = 0 };
        var sat = Math.max(0, (chroma(primaryColor).hsl()[1] * 100) - (100 - saturation));
        var lit = lightness * 3.5 * hsl[2];
        //console.log(hue, sat, lit)

        return `hsl(${hue}, ${sat}%, ${lit}%)`;
    }

    function changeBackColor(index, color) {
        var target = document.getElementsByClassName('cardBack')[index];
        var defaultColor = themeColor(49, 27);

        target.style.backgroundImage = 'linear-gradient(0, ' + color + ' 50%, ' + defaultColor + ' 50%)';
        target.classList.add('cardFill');
        target.animate([
            {borderColor: chroma(defaultColor).brighten(1).hex()},
            {borderColor: chroma(color).brighten(1).hex()}
        ], {
            duration: 1000
        })
        setTimeout(() => {
            target.classList.remove('cardFill');
            target.style.backgroundImage = 'none';
            //cards[index].backColor = color;
            //socket.emit('cardChange', { cards: cards, room: room });
        }, 1000);
    }

    function flipAll() {
        var cardsElements = document.getElementsByClassName('card');
        for (let i = 0; i < cardsElements.length; i++) {
            if (cards[i].flipped === false) {
                flipCard(cardsElements[i], i);
                cards[i].flipped = true;
                socket.emit('cardChange', { cards: cards, room: room });
            }
        }
    }

    function fillAll() {
        for (let i = 0; i < cards.length; i++) {
            socket.emit('prompt', { prompt: defaultStrings[i], color: loggedInAs.color, room: room });
        }
    }

    function promptSubmit(event) {
        if (event.target.value.length < 3) { return };
        if (event.key === 'Enter') {
            socket.emit('prompt', { prompt: event.target.value, color: loggedInAs.color, room: room });
            event.target.value = '';
            //clear textbox meter
            document.querySelector('.meterInput').style.backgroundImage = 'linear-gradient(90deg, lightblue 50%, transparent 50%)';
        }
    }

    function clueSubmit(event) {
        if (event.target.value.length < 3) { return };
        if (event.key === 'Enter') {
            socket.emit('clue', { clue: event.target.value, room: room });
            event.target.value = '';
        }
    }

    function gameStateText() {
        if (cards.length > 0) {
            if (winner !== '') { return winner.toUpperCase() + ' WINS' };
            if (cards.every(card => card.text !== '')) {
                //if all cards are filled
                if (started) {
                    if (turn === 'blue') {
                        if (clue === '') {
                            return 'Blue spymaster: submit a clue';
                        } else {
                            return 'Blue: the clue is ' + clue.toUpperCase() + (clueNumber !== 0 ? ' (' + (clueNumber + 1 - flipCount) + ' left)' : '');
                        }
                    } else {
                        if (clue === '') {
                            return 'Red spymaster: submit a clue';
                        } else {
                            return 'Red: the clue is ' + clue.toUpperCase() + (clueNumber !== 0 ? ' (' + (clueNumber + 1 - flipCount) + ' left)' : '');
                        }
                    }
                } else {
                    return 'Ready to start. Pick your teams';
                }
            } else {
                return 'Fill in all the cards';
            }
        }
    }

    function cardClick(event, i) {
        //filter
        if (!started) { return };
        if (turn !== players[socket.id].team && !debug) { return }; //not your turn
        if (teams.some(team => team.players[0] === socket.id) && !debug) { return }; //spymasters can't click
        if (cards.some(card => card.type === 'bomb' && !card.flipped)) { return }; //bomb has been flipped
        if (winner !== '') { return }; //game has ended
        //emit
        if (cards[i].flipped === true) {
            //cards[i].flipped = false;
            socket.emit('cardFlip', { index: i, value: false, room: room });
        }
    }

    function bombExplode(x, y) {
        var bomb1 = document.createElement('div');
        bomb1.className = 'bombCircle1';
        bomb1.style.left = x + 'px';
        bomb1.style.top = y + 'px';
        document.getElementsByClassName('App')[0].appendChild(bomb1);
        setTimeout(() => {
            bomb1.remove();
        }, 1000);
        for (let i = 0; i < 6; i++) {
            var bomb2 = document.createElement('div');
            bomb2.className = 'bombCircle2';
            bomb2.style.left = x + (Math.random() * 200) - 100 + 'px';
            bomb2.style.top = y + (Math.random() * 200) - 100 + 'px';
            var size = Math.ceil(Math.random() * 12) + 'px';
            bomb2.style.width = size;
            bomb2.style.height = size;
            document.getElementsByClassName('App')[0].appendChild(bomb2);
            setTimeout(() => {
                bomb2.remove();
            }, 2000);
        }
        /*var bomb3 = document.createElement('div');
        bomb3.className = 'bombCircle3';
        bomb3.style.left = x + 'px';
        bomb3.style.top = y + 'px';
        document.getElementsByClassName('App')[0].appendChild(bomb3);
        setTimeout(() => {
            bomb3.remove();
        }, 3000);*/
    }

    /*function clickRipple(x, y) {
        const cardElements = document.getElementsByClassName('card');
        for (let i = 0; i < cardElements.length; i++) {
            const cardElement = cardElements[i];
            const cardRect = cardElement.getBoundingClientRect();
            const cardCenterX = cardRect.left + (cardRect.width / 2);
            const cardCenterY = cardRect.top + (cardRect.height / 2);

            const deltaX = (cardCenterX - x) / 20;
            const deltaY = (cardCenterY - y) / 20;

            const startX = transforms[i].offsetX;
            const startY = transforms[i].offsetY;
            const endX = deltaX;
            const endY = deltaY;
            const duration = 650;
            const easing = (t) => Math.sin(t * Math.PI); // smooth curve back to 0

            let startTime;

            function animate(time) {
                if (!startTime) startTime = time;
                const elapsed = time - startTime;
                const progress = Math.min(elapsed / duration, 1);
                const easedProgress = easing(progress);

                transforms[i].offsetX = startX + (endX - startX) * easedProgress;
                transforms[i].offsetY = startY + (endY - startY) * easedProgress;
                setTransforms([...transforms]);

                if (progress < 1) {
                    requestAnimationFrame(animate);
                }
            }

            requestAnimationFrame(animate);
        }
    }*/

    /*function oldClickRipple(x, y) {
        const cardElements = document.getElementsByClassName('card');
        for (let i = 0; i < cardElements.length; i++) {
            const cardElement = cardElements[i];
            const cardRect = cardElement.getBoundingClientRect();
            const cardCenterX = cardRect.left + (cardRect.width / 2);
            const cardCenterY = cardRect.top + (cardRect.height / 2);

            const deltaX = (cardCenterX - x) / 20;
            const deltaY = (cardCenterY - y) / 20;

            cardElement.animate([
                { transform: 'translate(0px, 0px)' },
                { transform: `translate(${deltaX}px, ${deltaY}px)` },
                { transform: 'translate(0px, 0px)' }
            ], {
                duration: 1300,
                easing: 'cubic-bezier(0.175, 0.885, 0.32, 1.0)'
            });
        }
    }*/

    function buttonHover(event) {
        console.log('enter')
        const rect = event.currentTarget.getBoundingClientRect();
        const circle = event.currentTarget.querySelector('.buttonHoverCircle');
        console.log('enter 2')
        if (!circle) { return };
        circle.style.display = 'block'
        circle.style.left = (event.clientX - rect.left) + 'px';
        circle.style.top = (event.clientY - rect.top) + 'px';
    }

    function buttonUnhover(event) {
        console.log('exit')
        const circle = event.currentTarget.querySelector('.buttonHoverCircle');
        console.log(circle)
        if (!circle) { return };
        circle.style.display = 'none'
    }

    return (
        <div className="App" style={{backgroundImage: `radial-gradient(circle at center bottom, ${themeColor(64, 15)} 0%, ${themeColor(59, 12)} 100%)`}} onMouseMove={(event) => {
            var elements = document.getElementsByClassName('cardContainer');
            if (elements.length === 0) { return };
            var cardContainer = elements[0].getBoundingClientRect();
            elements = document.getElementsByClassName('gameScreen');
            if (elements.length === 0) { return };
            var screen = elements[0].getBoundingClientRect();
            socket.emit('mouseMove', { x: (event.clientX - screen.left) / interfaceScale, y: (event.clientY - screen.top) / interfaceScale, room: room });
        }}>
            {loggedInAs === '' ? <div className='loginScreen'>
                <input className='promptInput usernameInput' type='text' placeholder='Username' onKeyDown={(event) => { loginSubmit(event) }} onInput={(event) => {
                    socket.emit('loginInput', { username: event.target.value, password: document.getElementsByClassName('passwordInput')[0].value });
                }} />
                <input className='promptInput passwordInput' type='text' placeholder='Password' onKeyDown={(event) => { loginSubmit(event) }} onInput={(event) => {
                    socket.emit('loginInput', { username: document.getElementsByClassName('usernameInput')[0].value, password: event.target.value });
                }} />
                <div className='loginApprovalText' style={{ color: loginApprovalText.includes('Hit enter') ? 'rgb(38, 155, 90)' : 'rgb(75, 23, 34)' }}>{loginApprovalText}</div>
            </div> : null}

            {loggedInAs !== '' && room === '' ? <div className='roomScreen'>
                <div className='userContainer' style={{ borderColor: loggedInAs.color }}>
                    <div className='player' style={{ 
                        backgroundImage: `radial-gradient(circle, ${loggedInAs.color}, ${chroma(loggedInAs.color).darken(1).hex()})`, 
                        border: '4px solid ' + chroma(loggedInAs.color).brighten(1).hex(),
                        color: chroma(loggedInAs.color).darken(2).hex() 
                    }}>
                        <div className='playerText'>{loggedInAs.username}</div>
                    </div>
                    <input className='promptInput roomInput' type='text' placeholder='Room name' onKeyDown={(event) => { roomJoin(event) }} onInput={(event) => {
                        socket.emit('roomInput', event.target.value.toLowerCase());
                    }} />
                    <div className='logOutButton' onClick={() => { setLoggedInAs('') }}>Log out</div>
                </div>
                <div className='loginApprovalText' style={{ color: loginApprovalText.includes('Room has') ? 'rgb(38, 155, 90)' : 'rgb(51, 55, 136)' }}>{loginApprovalText}</div>
                {/*<input className='promptInput nicknameInput' type='text' placeholder='Nickname (optional)' />*/}
            </div> : null}

            <div className='gameScreen' style={{visibility: loggedInAs !== '' && room !== '' ? 'visible' : 'hidden'}} onClick={(event) => {
                var elements = document.getElementsByClassName('cardContainer');
                if (elements.length === 0) { return };
                var cardContainer = elements[0].getBoundingClientRect();
                elements = document.getElementsByClassName('gameScreen');
                if (elements.length === 0) { return };
                var screen = elements[0].getBoundingClientRect();
                if (teams.some(team => team.players[0] === socket.id) && started && !debug) { return }; //spymasters can't click if game has started
                socket.emit('mouseClick', { x: (event.clientX - screen.left) / interfaceScale, y: (event.clientY - screen.top) / interfaceScale, color: players[socket.id].team, room: room });
            }}>
                <div className='roomText' style={{color: themeColor(62, 21)}}><ReactFitty>ROOM {room.toUpperCase()}</ReactFitty></div>
                
                <div className='cardColumnContainer'>
                    {/*cardColumns.map((column, i) => {
                        return <div className='cardColumn' key={'column-' + i}>
                            {column.map((card, j) => {
                                return <div className='cardColumn3dContainer' key={'columnCard-' + i + '-' + j}>
                                    <div className='cardColumnCard'>
                                        {cardColumns[i][j].text}
                                    </div>
                                </div>
                            })}
                        </div>
                    })*/}
                </div>
                <div className='leaveRoomButton' style={{color: themeColor(70, 20)}} onClick={(event) => {
                    socket.emit('leaveRoom', { room: room, user: loggedInAs });
                    event.stopPropagation();
                }}>Leave room</div>

                {/*<div className='scoreCircleContainer'>
                    {cards.filter(card => card.type === 'blue').sort((a, b) => a.flipped > b.flipped).map(card => {
                        return <div className='scoreCircle' style={{ backgroundColor: card.flipped ? '' : 'blue', filter: card.flipped ? 'blur(4px)' : '' }}></div>
                    })}
                    <Icon path={mdiStar} size='6vw' color='black' style={{ filter: 'blur(4px)' }} />
                    {cards.filter(card => card.type === 'red').sort((a, b) => b.flipped > a.flipped).map(card => {
                        return <div className='scoreCircle' style={{ backgroundColor: card.flipped ? '' : 'red', filter: card.flipped ? 'blur(4px)' : '' }}></div>
                    })}
                </div>*/}

                <div className='cardContainer'>
                    <div className='gameStateContainer' style={{color: themeColor(37, 68)}}>
                        <ReactFitty>{gameStateText()}</ReactFitty>
                    </div>

                    {cards.map((card, i) => {
                        var outerStyle = {};
                        var frontStyle = {
                            backgroundColor: card.type === 'neutral' ? 'rgb(180, 208, 240)' : card.type === 'red' ? 'rgb(255, 0, 0)' : card.type === 'blue' ? 'rgb(0, 0, 255)' : 'rgb(0, 0, 0)',
                        };
                        var backStyle = {
                            color: themeColor(49, 70),
                            backgroundColor: card.backColor ? card.backColor : themeColor(49, 27),
                            borderColor: card.backColor ? chroma(card.backColor).brighten(1).hex() : chroma(themeColor(49, 27)).brighten(1).hex()
                        };

                        return (
                            <div className='card3dContainer'
                                key={'card-' + i}
                                onMouseMove={(event) => {/*
                                    const halfWidth = event.target.offsetWidth / 2;
                                    const halfHeight = event.target.offsetHeight / 2;
                                    const angleY = -(event.nativeEvent.offsetX - halfWidth) / 7;
                                    const angleX = -(event.nativeEvent.offsetY - halfHeight) / 7;
                                    cards[i].rotationX = Math.round(angleX);
                                    cards[i].rotationY = Math.round(angleY);
                                    socket.emit('cardChange', { cards: cards, room: room });*/
                                }}
                                onMouseLeave={(event) => {
                                    /*cards[i].rotationX = 0;
                                    cards[i].rotationY = 0;
                                    socket.emit('cardChange', { cards: cards, room: room });*/
                                }}
                            >
                                <div className='card' onClick={(event) => {cardClick(event, i)}}>
                                    {started ? <div className='cardFront' style={frontStyle}>
                                        <ReactFitty wrapText={true}>
                                            {card.text === '' ? ('CARD ' + (i + 1)) : card.text.toUpperCase()}
                                        </ReactFitty>
                                    </div> : null}
                                    <div className='cardBack' style={backStyle}>
                                        <div className='spymasterMark' style={{display: teams.some(team => team.players[0] === socket.id) && started && cards[i].type !== 'neutral' && cards[i].flipped ? 'flex' : 'none', color: cards[i].type === 'bomb' ? 'black' : (cards[i].type === 'neutral' ? 'white' : cards[i].type)}}>
                                            <Icon path={cards[i].type !== 'bomb' ? mdiCrownCircleOutline : mdiBomb} size={5} />
                                        </div>
                                        <ReactFitty wrapText={true}>
                                            {started ? card.text.toUpperCase() : null}
                                        </ReactFitty>
                                    </div>
                                </div>
                            </div>
                        );
                    })}

                    {/*players*/}
                    <div className='playerContainer'>
                        {teams.map((team, i) => {
                            return (
                                <div className='teamContainer' key={'team-' + i} style={{ borderColor: team.color, color: team.color }} onClick={(event) => {
                                    if (started) { return };
                                    socket.emit('switchTeam', {room: room, destinationTeam: team.color, sourceTeam: players[socket.id].team});
                                    event.stopPropagation();
                                }}>
                                    {team.name}
                                    {team.players.map((player, j) => {
                                        var isSpymaster = j === 0;
                                        if (typeof players[player] === 'undefined') { return null };

                                        return (
                                            <div className='player' key={'player-' + i + '-' + j} style={{ 
                                                backgroundImage: `radial-gradient(circle, ${players[player].color}, ${chroma(players[player].color).darken(1).hex()})`, 
                                                border: player === socket.id ? '4px solid ' + chroma(players[player].color).brighten(1).hex() : '',
                                                color: chroma(players[player].color).darken(2).hex() 
                                            }}>
                                                {isSpymaster ? <Icon className='spymasterIcon' path={mdiCrownCircleOutline} size={2} /> : null}
                                                <div className='playerText'>{players[player].username}</div>
                                            </div>
                                        );
                                    })}
                                </div>
                            );
                        })}
                        {started && turn === players[socket.id].team && winner === '' ? <div className='button' onClick={() => {socket.emit('endTurn', {room: room})}} onMouseEnter={(event) => {buttonHover(event)}} onMouseLeave={(event) => {buttonUnhover(event)}}>
                            <div className='buttonHoverCircle'></div>
                            END TURN
                        </div> : null}
                        {winner !== '' ? <div className='button' onClick={() => {socket.emit('reset', {room: room})}} onMouseEnter={(event) => {buttonHover(event)}} onMouseLeave={(event) => {buttonUnhover(event)}}>
                            <div className='buttonHoverCircle'></div>
                            NEW GAME
                        </div> : null}
                    </div>

                    {/*controls*/}
                    <div className='controlsContainer'>
                        {started ? <>
                            {teams.some(team => team.players[0] === socket.id) && turn === players[socket.id].team && winner === '' ? <input className='promptInput' type='text' placeholder='Spymaster clue' maxLength={40} onKeyDown={(event) => { clueSubmit(event) }} onClick={(event) => {event.stopPropagation()}} /> : null}
                            <div className='scoreMeter red' style={{backgroundColor: 'red', top: 0, left: 0, width: ((53.2 / (cards.filter(card => card.type === 'red').length + 1)) * (cards.filter(card => card.type === 'red' && !card.flipped).length + 1)) + '%'}}>
                                {cards.filter(card => card.type === 'red' && !card.flipped).length}
                                <Icon path={mdiStar} size={2.5} color='white' style={{ position: 'absolute', left: '506px'}} />
                            </div>
                            <div className='scoreMeter blue' style={{backgroundColor: 'blue', top: 0, right: 0, width: ((53.2 / (cards.filter(card => card.type === 'blue').length + 1)) * (cards.filter(card => card.type === 'blue' && !card.flipped).length + 1)) + '%'}}>
                                {cards.filter(card => card.type === 'blue' && !card.flipped).length}
                                <Icon path={mdiStar} size={2.5} color='white' style={{ position: 'absolute', right: '506px'}} />
                            </div>
                            <Icon path={mdiStar} className='scoreStar' size={2.5} color='black' />
                        </> : 
                        (cards.every(card => card.text !== '') ? <div className='button' onClick={() => {socket.emit('startGame', {room: room})}} onMouseEnter={(event) => {buttonHover(event)}} onMouseLeave={(event) => {buttonUnhover(event)}}>
                            <div className='buttonHoverCircle'></div>
                            START GAME
                        </div> : 
                        <><div className='button' onClick={() => {fillAll()}} onMouseEnter={(event) => {buttonHover(event)}} onMouseLeave={(event) => {buttonUnhover(event)}}>
                            <div className='buttonHoverCircle'></div>
                            Fill all
                        </div>
                        <input className='promptInput meterInput' type='text' placeholder='Submit prompts' maxLength={110} onKeyDown={(event) => { promptSubmit(event) }} onClick={(event) => {event.stopPropagation()}} onInput={(event) => {
                            var percent = 50 + (event.target.value.length / 110) * 50;
                            var meterColor = themeColor(60, 80);
                            document.querySelector('.meterInput').style.backgroundImage = `linear-gradient(90deg, ${meterColor} ${percent}%, transparent ${percent}%)`
                        }} /></>)}
                    </div>
                </div>

                {/*cursors*/}
                {Object.values(players).map((player, i) => {
                    var elements = document.getElementsByClassName('cardContainer');
                    if (elements.length === 0) { return };
                    var cardContainer = elements[0].getBoundingClientRect();
                    elements = document.getElementsByClassName('gameScreen');
                    if (elements.length === 0) { return };
                    var screen = elements[0].getBoundingClientRect();
                    //if (player.id === socket.id) { return null };
                    if (teams.some(team => team.players[0] === player.id) && started && !debug) { return null }; //spymasters don't get cursors
                    return (
                        <div className='cursor' key={'cursor-' + i} style={{ left: ((player.x)), top: ((player.y)), backgroundColor: player.team }}></div>
                    );
                })}
            </div>
            <div className='victoryOverlay'></div>
        </div>
    );
}

export default App;
