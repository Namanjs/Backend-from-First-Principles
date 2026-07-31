import http from "http";

const agentPooled = new http.Agent({ keepAlive: true, maxSockets: 10 });

function makeRequest(agent) {
    return new Promise((resolve, reject) => {
        const options = {
            hostname: "localhost",
            port: 3000,
            path: "/",
            method: "GET",
            agent: agent
        };

        const req = http.request(options, (res) => {
            const chunks = [];
            res.on("data", chunk => chunks.push(chunk));
            res.on("end", () => resolve(Buffer.concat(chunks).toString()));
        });

        req.on("error", reject);
        req.end();
    });
}

async function runUnpooled() {
    console.log("\n--- Unpooled (no keep-alive) ---");
    const start = Date.now();

    for (let i = 0; i < 100; i++) {
        await makeRequest(false); // false = no agent, new connection each time
    }

    const total = Date.now() - start;
    console.log(`Total time: ${total}ms`);
    console.log(`Average per request: ${(total / 100).toFixed(2)}ms`);
}

async function runPooled() {
    console.log("\n--- Pooled (keep-alive, 10 sockets) ---");
    const start = Date.now();

    for (let i = 0; i < 100; i++) {
        await makeRequest(agentPooled);
    }

    const total = Date.now() - start;
    console.log(`Total time: ${total}ms`);
    console.log(`Average per request: ${(total / 100).toFixed(2)}ms`);
}

async function main() {
    await runUnpooled();

    // wait a moment so TIME_WAIT connections are visible
    await new Promise(resolve => setTimeout(resolve, 1000));
    console.log("\nRun: ss -t state time-wait | wc -l");
    await new Promise(resolve => setTimeout(resolve, 4000));

    await runPooled();
}

main();