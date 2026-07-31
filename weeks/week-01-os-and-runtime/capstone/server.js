import net from "net";

const routes = {};

function register(command, handler) {
  routes[command.toUpperCase()] = handler;
}

register("ECHO", (args, socket) => socket.write(`Echo: ${args.join(" ")}\n`));
register("TIME", (args, socket) => socket.write(`${new Date().toISOString()}\n`));
register("QUIT", (args, socket) => {
  socket.write("Bye\n");
  socket.end();
});
register("PING", (args, socket) => socket.write("PONG\n"));

function parseInput(data) {
  const str = data.toString().trim();
  const parts = str.split(" ");
  const command = parts[0].toUpperCase();
  const args = parts.slice(1);
  return { command, args };
}

const server = net.createServer((socket) => {
  console.log(
    `[${new Date().toISOString()}] Client connected: ${socket.remoteAddress}:${socket.remotePort}`
  );

  socket.write("Welcome to the server\n");

  socket.on("end", () => {
    console.log(
      `[${new Date().toISOString()}] Client disconnected: ${socket.remoteAddress}:${socket.remotePort}`
    );
  });

  socket.on("error", (err) => {
    console.log(`Socket error: ${err.message}`);
  });

  socket.on("data", (data) => {
    if (socket.destroyed) return;

    const { command, args } = parseInput(data);

    if (command in routes) {
      routes[command](args, socket);
    } else {
      socket.write("Error, Unknown command\n");
    }
  });
});

function gracefulShutdown(signal) {
  console.log(`${signal} received. Starting graceful shutdown...`);

  server.close(() => {
    console.log("Graceful shutdown complete");
    process.exit(0);
  });

  setTimeout(() => {
    console.log("Force shutdown");
    process.exit(1);
  }, 5000);
}

process.on("SIGTERM", () => gracefulShutdown("SIGTERM"));
process.on("SIGINT", () => gracefulShutdown("SIGINT"));

server.listen(4000, () => {
  console.log("Server is listening on port: 4000");
});