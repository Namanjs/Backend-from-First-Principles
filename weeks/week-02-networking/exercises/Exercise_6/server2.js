import dns from "node:dns";
import { performance } from "node:perf_hooks";
import fs from "node:fs";

const hostnames = [
    "google.com",
    "github.com",
    "stackoverflow.com",
    "nodejs.org",
    "npmjs.com",
    "microsoft.com",
    "apple.com",
    "amazon.com",
    "cloudflare.com",
    "mozilla.org"
];

function dnsLookup(hostname) {
    return new Promise((resolve, reject) => {
        dns.lookup(hostname, { all: true }, (err) => {
            if (err) {
                reject(err);
                return;
            }

            resolve();
        });
    });
}

async function lookupRunner(hostnames) {
    const start = performance.now();

    await Promise.all(
        hostnames.map(hostname => dnsLookup(hostname))
    );

    return performance.now() - start;
}

function fsRead() {
    return new Promise((resolve, reject) => {
        const start = performance.now();

        fs.readFile("../../notes.md", "utf8", (err, data) => {
            if (err) {
                reject(err);
                return;
            }

            const elapsed = performance.now() - start;
            resolve(elapsed);
        });
    });
}

console.log("Running benchmark...\n");

const [lookupTime, fileReadTime] = await Promise.all([
    lookupRunner(hostnames),
    fsRead()
]);

console.log(`10 concurrent dns.lookup() calls: ${lookupTime.toFixed(2)} ms`);
console.log(`fs.readFile(): ${fileReadTime.toFixed(2)} ms`);