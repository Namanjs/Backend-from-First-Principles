import fs from "fs";

let count = 0;

while(true){
    try {
        const fd = fs.openSync('/dev/null');
        count++;
        console.log(count);
    } catch (error) {
        console.log("EmFile Error\n");
        console.log(`Hit FD Limit at ${count} open files`);
        break;
     }
}