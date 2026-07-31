import dns from "node:dns";
import { performance } from "node:perf_hooks";

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
    "mozilla.org",
    "openai.com",
    "wikipedia.org",
    "reddit.com",
    "linkedin.com",
    "youtube.com",
    "facebook.com",
    "instagram.com",
    "x.com",
    "netflix.com",
    "bing.com"
];

function dnsLookup(hostname){
    return new Promise((resolve, reject) => {
        const start = performance.now();

        dns.lookup(hostname, { all: true }, (err, addresses) => {
            if(err){
                reject(err);
                return;
            }

            const lookupElapsed = performance.now() - start;
            resolve(lookupElapsed);
        });
    });
};

function dnsResolve4(hostname) {
    return new Promise((resolve, reject) => {
        const start = performance.now();

        dns.resolve4(hostname, { ttl: true }, (err, address) => {
            if(err){
                reject(err);
                return;
            }

            const resolveElapsed = performance.now() - start;
            resolve(resolveElapsed);
        });
    });
};

async function lookupRunner(hostnames) {
    const start = performance.now();

    await Promise.all(
        hostnames.map(dnsLookup)
    );

    return performance.now() - start;
}

async function resolveRunner(hostnames) {
    const start = performance.now();

    await Promise.all(
        hostnames.map(dnsResolve4)
    );

    return performance.now() - start;
}

const lookupTime = await lookupRunner(hostnames);
const resolveTime = await resolveRunner(hostnames);

if(lookupTime > resolveTime){
    console.log(`dns.resolve4 is faster by ${lookupTime - resolveTime}`);
}else{
    console.log(`dns.lookup is faster by ${resolveTime - lookupTime}`);
}