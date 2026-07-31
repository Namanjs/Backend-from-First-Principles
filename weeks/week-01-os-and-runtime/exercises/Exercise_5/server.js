import fs from "fs";
import { performance } from 'node:perf_hooks';

function readTheFile(path){
    return new Promise((resolve, reject) => {
        fs.readFile(path, (err, data) => {
            if(err){
                reject(err);
            }else{
                resolve(data);
            }
        })
    })
}

const start = performance.now();
const promises = [];
for(let i = 0; i < 20; i++){
    promises.push(readTheFile("bigfile.bin"));
}
await Promise.all(promises);

console.log(performance.now() - start);
