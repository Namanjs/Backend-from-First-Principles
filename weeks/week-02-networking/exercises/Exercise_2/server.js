import net from "net";

const connections = new Map();

let totalConnections = 0;
let totalBytesReceived = 0;
let totalBytesSent = 0;

const server = net.createServer((socket) => {

    console.log(
        `Client ${socket.remoteAddress}:${socket.remotePort} connected at ${new Date().toISOString()}`
    );

    totalConnections++;

    connections.set(socket.remotePort, {
        remoteAddress: socket.remoteAddress,
        connectTime: new Date().toISOString(),
        bytesReceived: 0,
        bytesSent: 0,
        active: true
    });

    socket.setTimeout(60000);

    socket.on("data", (buffer) => {

        const conn = connections.get(socket.remotePort);

        conn.bytesReceived += buffer.length;
        totalBytesReceived += buffer.length;

        const input = buffer.toString().trim();

        const [command, ...args] = input.split(" ");

        switch (command.toUpperCase()) {

            case "ECHO":
                handleEcho(args, socket);
                break;

            case "TIME":
                handleTime(socket);
                break;

            case "STATS":
                handleStats(socket);
                break;

            case "CONNS":
                handleConns(socket);
                break;

            case "QUIT":
                handleQuit(socket);
                break;

            default:
                socket.write("Unknown command\n");
        }
    });

    socket.on("timeout", () => {

        socket.write("Idle timeout\n");
        socket.end();

    });

    socket.on("close", () => {

        const conn = connections.get(socket.remotePort);

        if (conn)
            conn.active = false;

            console.log(
            `Client ${socket.remotePort} disconnected at ${new Date().toISOString()}`
        );

    });

    socket.on("error", console.error);

});

function updateBytes(socket) {

    const conn = connections.get(socket.remotePort);

    conn.bytesSent = socket.bytesWritten;
    totalBytesSent = 0;

    for (const value of connections.values())
        totalBytesSent += value.bytesSent;
}

function handleEcho(args, socket) {

    socket.write(args.join(" ") + "\n");

    updateBytes(socket);
}

function handleTime(socket) {

    socket.write(new Date().toISOString() + "\n");

    updateBytes(socket);
}

function handleStats(socket) {

    let active = 0;

    for (const value of connections.values()) {

        if (value.active)
            active++;

    }

    socket.write(
        `Total: ${totalConnections}
        Active: ${active}
        Bytes Received: ${totalBytesReceived}
        Bytes Sent: ${totalBytesSent}\n`
    );

    updateBytes(socket);
}

function handleConns(socket) {

    let output = "";

    for (const [port, value] of connections) {

        if (!value.active) continue;

        output += `${value.remoteAddress}:${port} Connected: ${value.connectTime}\n`;
    }

    socket.write(output || "No active connections\n");

    updateBytes(socket);
}

function handleQuit(socket) {

    socket.write("Goodbye\n");

    updateBytes(socket);

    socket.end();
}

server.listen(3000);