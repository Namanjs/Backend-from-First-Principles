import WebSocket from 'ws';
import readline from "readline";

const ws = new WebSocket('ws://localhost:8000');

const rl = readline.createInterface({
    input: process.stdin,
    output: process.stdout
})

ws.on('error', console.error);

ws.on('open', function open() {
    console.log("Connection to Server\n");
});

ws.on('message', function message(data) {
  console.log('Server: %s', data);
});

rl.on("line", (line) => {
    if(ws.readyState === WebSocket.OPEN){
        ws.send(line);
    }else{
        console.log("Not connected");
    }
});

ws.on('close', () => {
    console.log(`Connection Closed`);
})