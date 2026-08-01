import express from "express";
import crypto from "crypto";

const app = express();
app.use(express.json({ limit: "10kb" }));

let books = [
    { id: "101", title: "Book1", author: "author1", availableCopies: 1, version: 1 },
    { id: "102", title: "Book2", author: "author2", availableCopies: 2, version: 1 },
    { id: "103", title: "Book3", author: "author3", availableCopies: 0, version: 1 },
];

let members = [
    { id: "member_1", name: "Alice" },
    { id: "member_2", name: "Bob" },
    { id: "member_3", name: "Charlie" }
];

let borrows = [];

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
    return res.status(200).json({ items: books });
});

app.post("/books/:bookId/borrows", (req, res) => {
    const bookId = req.params.bookId;
    const { memberId } = req.body || {};

    if(typeof memberId !== "string" || memberId.trim().length === 0){
        return errorResponse(res, {
            type: "validation-error",
            title: "Validation error",
            status: 422,
            detail: "One or more fields are invalid",
            requestId: req.requestId,
        });
    }

    const member = members.find(member => member.id === memberId);

    if(!member){
        return errorResponse(res, {
            type: "member-not-found",
            title: "Member not found",
            status: 404,
            detail: `Member with ID ${memberId} does not exist`,
            requestId: req.requestId,
        });
    }

    const book = books.find((book) => book.id === bookId);

    if(!book){
        return errorResponse(res, {
            type: "resource-not-found",
            title: "Resource not found",
            status: 404,
            detail: `Resource with ID ${bookId} does not exist`,
            requestId: req.requestId,
        });
    }

    if(book.availableCopies <= 0){
        return errorResponse(res, {
            type: "state-conflict",
            title: "No available copies",
            status: 409,
            detail: `Book ${book.id} has no available copies to borrow`,
            requestId: req.requestId,
        });
    }

    book.availableCopies -= 1;

    const borrowRecord = {
        id: crypto.randomUUID(),
        bookId,
        memberId,
        borrowedAt: new Date().toISOString(),
        dueAt: new Date(Date.now() + 14 * 24 * 60 * 60 * 1000).toISOString(),
    };

    borrows.push(borrowRecord);

    res.setHeader("Location", `/borrows/${borrowRecord.id}`);

    return res.status(201).json(borrowRecord);
});

app.get("/books/:bookId/borrows", (req, res) => {
    const bookId = req.params.bookId;

    const book = books.find((book) => book.id === bookId);

    if(!book){
        return errorResponse(res, {
            type: "resource-not-found",
            title: "Resource not found",
            status: 404,
            detail: `Book with ID ${bookId} does not exist`,
            requestId: req.requestId,
        });
    }

    const borrowed = borrows.filter((b) => b.bookId === bookId);

    return res.status(200).json({borrowed});
})

app.listen(3000, () => {
    console.log("Server listening on port 3000");
});
