import WebSocket, { WebSocketServer } from 'ws';
import http from "http";
import url from "node:url";

const server = http.createServer();

const wss = new WebSocketServer({
  server
});

let nextId = 1;

wss.on('connection', (ws, req) => {
    ws.on("error", (error) => {
        console.log(error);
    });

    const id = nextId++;
    req.socket.id = id;

    wss.clients.forEach((client) => {
        if(client.readyState === WebSocket.OPEN){
            client.send(`User ${id} joined`);
        }
    });

    ws.on("message", (data) => {
        wss.clients.forEach((client) => {
            if(client.readyState === WebSocket.OPEN){
                client.send(`User ${id}: ${data}`);
            }
        })
    })

    ws.on('close', () => {
        wss.clients.forEach((client) => {
            if(client.readyState === WebSocket.OPEN){
                client.send(`User ${id} Disconnected`);
            }
        })
    })
});

function getStats(req, res){
    res.writeHead(200, "", { 'Content-Type': 'application/json'});
    let currentConnectionCount = 0;
    wss.clients.forEach((client) => {
        currentConnectionCount++;
    })
    res.end(JSON.stringify(`Current connection count: ${currentConnectionCount}`));
}

server.on("request", (req, res) => {
    const method = req.method.toUpperCase();

    const parsedUrl = url.parse(req.url, false);
    const pathname = parsedUrl.pathname;
    
    res.setHeader('Access-Control-Allow-Origin', '*');
    res.setHeader('Access-Control-Allow-Methods', 'GET');
    res.setHeader('Access-Control-Allow-Headers', 'Content-Type');

    if(method === "GET" && pathname === "/stats"){
        getStats(req, res);
    }else{
        res.writeHead(200, "", { 'Content-Type': 'application/json'});
        res.end(JSON.stringify("Invalid Request"))
    }
});

server.listen(8000, () => {
    console.log("Server is listening ----")
})