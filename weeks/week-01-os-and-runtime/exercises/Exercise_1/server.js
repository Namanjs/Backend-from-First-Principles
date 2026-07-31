import net from 'net';

const server = net.createServer();

server.on('connection', (socket) => {
    console.log(`Client Connected: ${socket.remoteAddress}:${socket.remotePort}`);
    socket.on('data', (data) => {
        console.log(data.toString());
        socket.write(`Echo: ${data.toString()}`);
    })

    socket.on('close', () => {
        console.log("Client Disconnected");
    })
})

server.listen(4000, () => {
    console.log(`Server listening on PORT: 4000`)
})