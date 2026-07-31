import express from "express";

const app = express();

app.use(express.json());

app.get("/slow", async (req, res) => {
    console.log("Slow request started");

    await new Promise((resolve) => setTimeout(resolve, 5000));

    console.log("Slow request finished");

    res.send("async request completed after 5 seconds");
});

const server = app.listen(3000, () => {
    console.log(`Server started on port 3000, PID: ${process.pid}`);
});

function gracefulShutdown(signal) {
    console.log(`${signal} received. Starting graceful shutdown`);

    server.close(() => {
        console.log("Graceful shutdown complete");
        process.exit(0);
    });

    setTimeout(() => {
        console.log("Could not close connections in time. Forcing shutdown");
        process.exit(1);
    }, 10000);
}

process.on("SIGTERM", () => gracefulShutdown("SIGTERM"));
process.on("SIGINT", () => gracefulShutdown("SIGINT"));