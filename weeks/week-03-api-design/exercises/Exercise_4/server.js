import express from "express";
import crypto from "crypto";

const app = express();
app.use(express.json({ limit: "10kb" }));

let books = Array.from({ length: 30 }, (_, i) => ({
    id: `book_${i + 1}`,
    title: `Book ${i + 1}`,
    author: `Author ${i + 1}`,
    createdAt: new Date(Date.now() - (30 - i) * 60000).toISOString()
}));

function errorResponse(res, { type, title, status, detail, requestId }) {
    return res.status(status).json({
        type,
        title,
        status,
        detail,
        requestId
    });
}

function encodeCursor(data) {
    return Buffer.from(JSON.stringify(data)).toString("base64");
}

function decodeCursor(cursorStr) {
    try {
        const jsonStr = Buffer.from(cursorStr, "base64").toString("utf-8");
        return JSON.parse(jsonStr);
    } catch {
        return null;
    }
}

app.use((req, res, next) => {
    req.requestId = crypto.randomUUID();
    res.setHeader("X-Request-Id", req.requestId);
    next();
});

app.get("/books", (req, res) => {
    const rawLimit = Number(req.query.limit) || 10;
    const limit = Math.min(Math.max(rawLimit, 1), 50);
    const cursor = req.query.cursor;

    const sorted = [...books].sort((a, b) => new Date(b.createdAt) - new Date(a.createdAt));

    let list = sorted;

    if (cursor) {
        const decoded = decodeCursor(cursor);

        if (!decoded || !decoded.createdAt || !decoded.id) {
            return errorResponse(res, {
                type: "validation-error",
                title: "Validation error",
                status: 422,
                detail: "Malformed or invalid cursor parameter",
                requestId: req.requestId
            });
        }

        list = sorted.filter((book) => {
            const bookTime = new Date(book.createdAt).getTime();
            const cursorTime = new Date(decoded.createdAt).getTime();

            if (bookTime === cursorTime) {
                return book.id < decoded.id;
            }
            return bookTime < cursorTime;
        });
    }

    const items = list.slice(0, limit);

    const hasMore = list.length > limit;
    const lastItem = items[items.length - 1];

    const nextCursor = hasMore && lastItem
        ? encodeCursor({ createdAt: lastItem.createdAt, id: lastItem.id })
        : null;

    return res.status(200).json({
        items,
        page: {
            limit,
            nextCursor,
            hasMore
        }
    });
});

app.post("/books", (req, res) => {
    const { title, author } = req.body || {};
    const newBook = {
        id: `book_${books.length + 1}`,
        title: title || "Untitled",
        author: author || "Unknown",
        createdAt: new Date().toISOString()
    };
    books.push(newBook);
    return res.status(201).json(newBook);
});

app.listen(3000, () => {
    console.log("Server listening on port 3000");
});
