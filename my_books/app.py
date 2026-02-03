from flask import Flask, jsonify, request
from flask_cors import CORS
from pathlib import Path
import pdfplumber

# -------------------------
# App Setup
# -------------------------
app = Flask(__name__)
CORS(app)

BASE_DIR = Path(__file__).resolve().parent
BOOKS_DIR = BASE_DIR / "books"

print("📁 Books directory:", BOOKS_DIR)
print("📂 Exists:", BOOKS_DIR.exists())

# -------------------------
# Utilities
# -------------------------
def extract_lines_from_pdf(pdf_path: Path, words_per_line: int = 3):
    if not pdf_path.exists():
        raise FileNotFoundError("PDF not found")

    text = ""
    with pdfplumber.open(pdf_path) as pdf:
        for page in pdf.pages:
            page_text = page.extract_text()
            if page_text:
                text += page_text.replace("\n", " ") + " "

    words = text.split()
    return [
        " ".join(words[i:i + words_per_line])
        for i in range(0, len(words), words_per_line)
    ]


def list_books():
    if not BOOKS_DIR.exists():
        return []

    return [
        {
            "name": pdf.name,
            "title": pdf.stem.replace("_", " ")
        }
        for pdf in sorted(BOOKS_DIR.glob("*.pdf"))
    ]

# -------------------------
# Routes
# -------------------------
@app.route("/health", methods=["GET"])
def health():
    return jsonify({"status": "ok"})


@app.route("/books", methods=["GET"])
def get_books():
    return jsonify(list_books())


@app.route("/book", methods=["GET"])
def get_book():
    name = request.args.get("name")

    if not name:
        return jsonify({"error": "Query parameter 'name' is required"}), 400

    pdf_path = BOOKS_DIR / name

    if not pdf_path.exists():
        return jsonify({"error": "Book not found"}), 404

    try:
        words_per_line = int(request.args.get("words", 3))
        lines = extract_lines_from_pdf(pdf_path, words_per_line)
        return jsonify({
            "book": name,
            "words_per_line": words_per_line,
            "lines": lines
        })
    except Exception as e:
        return jsonify({"error": str(e)}), 500


# -------------------------
# Run App
# -------------------------
if __name__ == "__main__":
    app.run(host="0.0.0.0", port=5000, debug=True)
