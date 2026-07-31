import http from "http";

const agent = new http.Agent({
    keepAlive: true,
    maxSockets: 10
});

const DEFAULT_TIMEOUT = 5000;
const MAX_RETRIES = 2;

async function request(
    method,
    url,
    body = null,
    headers = {}
) {
    return new Promise((resolve, reject) => {
        const start = Date.now();

        const parsedUrl = new URL(url);

        let data = null;

        if (body !== null) {
            data = JSON.stringify(body);

            headers["Content-Type"] = "application/json";
            headers["Content-Length"] = Buffer.byteLength(data);
        }

        const options = {
            hostname: parsedUrl.hostname,
            port: parsedUrl.port,
            path: parsedUrl.pathname + parsedUrl.search,
            method,
            headers,
            agent
        };

        let retries = 0;

        function send() {
            const req = http.request(options, (res) => {
                let responseBody = "";

                res.on("data", (chunk) => {
                    responseBody += chunk;
                });

                res.on("end", () => {
                    const duration = Date.now() - start;

                    console.log(
                        `${method} ${url} -> ${res.statusCode} (${duration}ms)`
                    );

                    try {
                        const parsed = responseBody
                            ? JSON.parse(responseBody)
                            : null;

                        resolve({
                            status: res.statusCode,
                            headers: res.headers,
                            data: parsed
                        });
                    } catch (err) {
                        reject(err);
                    }
                });
            });

            req.setTimeout(DEFAULT_TIMEOUT, () => {
                req.destroy(new Error("Request timed out"));
            });

            req.on("error", (err) => {
                if (retries < MAX_RETRIES) {
                    retries++;
                    return send();
                }

                reject(err);
            });

            if (data) {
                req.write(data);
            }

            req.end();
        }

        send();
    });
}

const client = {
    get(url, headers = {}) {
        return request("GET", url, null, headers);
    },

    post(url, body, headers = {}) {
        return request("POST", url, body, headers);
    },

    put(url, body, headers = {}) {
        return request("PUT", url, body, headers);
    },

    delete(url, headers = {}) {
        return request("DELETE", url, null, headers);
    }
};

export default client;