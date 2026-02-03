from flask import Flask, jsonify, request
from flask_cors import CORS
from pathlib import Path
import pdfplumber

app = Flask(__name__)
CORS(app)

BOOKS_DIR = Path(__file__).resolve().parent / "my books"


def extract_lines_from_pdf(pdf_path, words_per_line=3):
    text = ""
    with pdfplumber.open(pdf_path) as pdf:
        for page in pdf.pages:
            page_text = page.extract_text()
            if page_text:
                text += page_text + " "

    words = text.replace("\n", " ").split()
    lines = []

    for i in range(0, len(words), words_per_line):
        lines.append(" ".join(words[i:i + words_per_line]))

    return lines


def list_books():
    if not BOOKS_DIR.exists():
        return []
    pdfs = sorted(BOOKS_DIR.glob("*.pdf"))
    return [
        {"name": p.name, "title": p.stem.replace("_", " ")}
        for p in pdfs
    ]


@app.route("/books")
def get_books():
    return jsonify(list_books())


@app.route("/book")
def get_book():
    name = request.args.get("name", "").strip()
    books = {b["name"] for b in list_books()}
    if not name:
        return jsonify({"error": "Missing book name"}), 400
    if name not in books:
        return jsonify({"error": "Book not found"}), 404
    pdf_path = BOOKS_DIR / name
    lines = extract_lines_from_pdf(pdf_path)
    return jsonify(lines)


if __name__ == "__main__":
    app.run(host="0.0.0.0", port=5000, debug=True)
