// Schedule work in different phases and predict the order
import fs from "fs";
console.log('sync 1');

setTimeout(() => console.log('setTimeout 0'), 0);
setTimeout(() => console.log('setTimeout 100'), 100);

setImmediate(() => console.log('setImmediate 1'));
setImmediate(() => {
  console.log('setImmediate 2');
  process.nextTick(() => console.log('nextTick inside setImmediate'));
  Promise.resolve().then(() => console.log('promise inside setImmediate'));
});

process.nextTick(() => console.log('nextTick 1'));
process.nextTick(() => {
  console.log('nextTick 2');
  process.nextTick(() => console.log('nested nextTick'));
});

Promise.resolve().then(() => console.log('promise 1'));
Promise.resolve().then(() => {
  console.log('promise 2');
  process.nextTick(() => console.log('nextTick inside promise'));
});

fs.readFile("server.js", () => {
  console.log('fs.readFile callback');
  setTimeout(() => console.log('setTimeout inside fs'), 0);
  setImmediate(() => console.log('setImmediate inside fs'));
});

console.log('sync 2');