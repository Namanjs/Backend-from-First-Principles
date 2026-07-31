import express from 'express';

const app = express();

app.use(express.json());

app.get("/wait", (req, res) => {
    setTimeout(() => {
        res.send(`SetTimeout ran after 3 seconds`);
    }, 3000);
});

app.get("/block", (req, res) => {
    const start = Date.now();
    while(Date.now() - start < 3000){
        //do nothing
    }

    res.send("CPU Bound worf for 3 seconds");
});

app.get("/fast", (req, res) => {
    res.send(`{ status: ok }`);
});

app.listen(3000, () => {
    console.log("Server is listening on PORT: 3000");
})