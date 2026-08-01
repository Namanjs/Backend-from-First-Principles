import express from "express";
import crypto, { getCipherInfo } from "crypto";

const app = express();
app.use(express.json({ limit: "10kb" }));

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
    }
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

function validateCreateBook(body) {
    if (typeof body !== "object" || body === null) {
        return {
            errors: [{ field: "body", message: "Request body must be a non-null object" }],
            data: null
        };
    }

    const errors = [];

    if (typeof body.title !== "string" || body.title.trim().length === 0) {
        errors.push({ field: "title", message: "Title must be a non-empty string" });
    } else if (body.title.trim().length > 500) {
        errors.push({ field: "title", message: "Title cannot exceed 500 characters" });
    }

    if (typeof body.author !== "string" || body.author.trim().length === 0) {
        errors.push({ field: "author", message: "Author must be a non-empty string" });
    } else if (body.author.trim().length > 50) {
        errors.push({ field: "author", message: "Author name cannot exceed 50 characters" });
    }

    if (errors.length > 0) {
        return { errors, data: null };
    }

    return {
        errors: null,
        data: {
            title: body.title.trim(),
            author: body.author.trim()
        }
    };
}

app.get("/books", (req, res) => {
    return res.status(200).json({
        items: books
    });
});

app.post("/books", (req, res) => {
    const { errors, data } = validateCreateBook(req.body);

    if (errors) {
        return res.status(422).json({
            type: "validation-error",
            title: "Validation error",
            status: 422,
            detail: "One or more fields are invalid",
            requestId: req.requestId,
            errors
        });
    }

    const newBook = {
        id: `book_${books.length + 1}`,
        title: data.title,
        author: data.author,
        availableCopies: 1,
        version: 1
    };

    books.push(newBook);
    return res.status(201).json(newBook);
});

app.listen(3000, () => {
    console.log("Server listening on port 3000");
});