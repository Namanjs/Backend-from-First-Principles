import express from "express";
import crypto from "crypto";

const app = express();
app.use(express.json());

let books = [
    {
        id: "101",
        title: "Book1",
        author: "author1",
        availableCopies: 100,
        version: 1
    },
    {
        id: "102",
        title: "Book2",
        author: "author2",
        availableCopies: 100,
        version: 1
    },
    {
        id: "103",
        title: "Book3",
        author: "author3",
        availableCopies: 100,
        version: 1
    },
    {
        id: "104",
        title: "Book4",
        author: "author4",
        availableCopies: 100,
        version: 1
    },
    {
        id: "105",
        title: "Book5",
        author: "author5",
        availableCopies: 100,
        version: 1
    },
];

function errorResponse(res, { type, title, status, detail, requestId }) {
    return res.status(status).json({
        type,
        title,
        status,
        detail,
        requestId
    });
}

app.use((req, res, next) => {
    req.requestId = crypto.randomUUID();
    res.setHeader("X-Request-Id", req.requestId);
    next();
});

app.get("/books", (req, res) => {
    return res.status(200).json({
        items: books
    });
});

app.get("/books/:id", (req, res) => {
    const id = req.params.id;

    const book = books.find((book) => book.id === id);

    if (!book) {
        return errorResponse(res, {
            type: "resource-not-found",
            title: "Resource not found",
            status: 404,
            detail: `Book with ID ${id} does not exist`,
            requestId: req.requestId
        });
    }

    res.status(200).json(
        book,
    );
});

app.post("/books", (req, res) => {
    const { title, author } = req.body;
    const id = crypto.randomUUID();

    const book = {
        id,
        title,
        author,
        availableCopies: 1,
        version: 1
    };

    books.push(book);

    res.setHeader("Location", `/books/${id}`);

    return res.status(201).json(book);
});

app.patch("/books/:id", (req, res) => {
    const id = req.params.id;
    let isUpdated = false;
    const book = books.find((book) => book.id === id);

    if(!book){
        return errorResponse(res, {
            type: "resource-not-found",
            title: "Resource not found",
            status: 404,
            detail: `Book with ID ${id} does not exist`,
            requestId: req.requestId
        });
    }

    if(req.body.title !== undefined){
        book.title = req.body.title;
        isUpdated = true;
    }

    if(req.body.author !== undefined){
        book.author = req.body.author;
        isUpdated = true;
    }

    if(isUpdated){
        book.version += 1;
    }

    return res.status(200).json(book);
});

app.delete("/books/:id", (req, res) => {
    const id = req.params.id;
    const index = books.findIndex((book) => book.id === id);

    if(index === -1){
        return errorResponse(res, {
            type: "resource-not-found",
            title: "Resource not found",
            status: 404,
            detail: `Book with ID ${id} does not exist`,
            requestId: req.requestId,
        });
    }

    books.splice(index, 1);

    return res.status(204).send();
})

app.listen(3000, () => {
    console.log("Server is listening on server 3000");
})

