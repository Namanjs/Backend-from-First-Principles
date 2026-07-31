import http from "http";

const users = {
    user1: {
        name: "Naman",
        age: 21
    },
    user2: {
        name: "Naman2",
        age: 22
    },
    user3: {
        name: "Naman3",
        age: 23
    }
};

const routes = new Map();

function addRoute(method, path, handler) {
    routes.set(`${method}:${path}`, handler);
}

function sendJSON(res, statusCode, data) {
    res.writeHead(statusCode, {
        "Content-Type": "application/json"
    });

    res.end(JSON.stringify(data));
}

function readBody(req) {
    return new Promise((resolve, reject) => {

        const chunks = [];

        req.on("data", chunk => chunks.push(chunk));

        req.on("end", () => {
            try {
                const body = JSON.parse(Buffer.concat(chunks).toString());
                resolve(body);
            } catch {
                reject(new Error("Invalid JSON"));
            }
        });

        req.on("error", reject);

    });
}

addRoute("GET", "/", (req, res) => {

    sendJSON(res, 200, {
        message: "Hello from raw HTTP"
    });

});

addRoute("GET", "/users", (req, res) => {

    sendJSON(res, 200, users);

});

addRoute("POST", "/users", async (req, res) => {

    try {

        const user = await readBody(req);

        const id = `user${Object.keys(users).length + 1}`;

        users[id] = user;

        sendJSON(res, 201, user);

    } catch {

        sendJSON(res, 400, {
            error: "Invalid JSON"
        });

    }

});

addRoute("GET", "/stream", (req, res) => {

    res.writeHead(200, {
        "Content-Type": "text/plain"
    });

    let chunkNumber = 1;

    const timer = setInterval(() => {

        res.write(`Chunk ${chunkNumber}\n`);

        chunkNumber++;

        if (chunkNumber > 5) {

            clearInterval(timer);

            res.end();

        }

    }, 500);

});

const server = http.createServer((req, res) => {

    const method = req.method;

    const { pathname } = new URL(req.url, `http://${req.headers.host}`);

    res.setHeader("Access-Control-Allow-Origin", "*");
    res.setHeader("Access-Control-Allow-Methods", "GET, POST, PUT, DELETE, OPTIONS");
    res.setHeader("Access-Control-Allow-Headers", "Content-Type");

    if (method === "OPTIONS") {
        res.writeHead(204);
        return res.end();
    }

    const handler = routes.get(`${method}:${pathname}`);

    if (!handler) {

        return sendJSON(res, 404, {
            error: "Not found"
        });

    }

    handler(req, res);

});

server.listen(3000, () => {

    console.log(`Server listening on port 3000. PID: ${process.pid}`);

});