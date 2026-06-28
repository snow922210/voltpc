# -*- coding: utf-8 -*-
import os
import sys
from pathlib import Path

import pytest
from fastapi import HTTPException, Response


BACKEND = Path(__file__).resolve().parents[1]
if str(BACKEND) not in sys.path:
    sys.path.insert(0, str(BACKEND))

os.environ.setdefault("DEV_SHOW_CODES", "1")

import main  # noqa: E402
import mailer  # noqa: E402


@pytest.fixture()
def fresh_db(tmp_path, monkeypatch):
    monkeypatch.setattr(main, "DB_PATH", tmp_path / "voltpc-test.db")
    monkeypatch.setattr(main, "SECRET_PATH", tmp_path / ".secret")
    monkeypatch.setattr(main, "SECRET", b"test-secret-for-critical-flows")
    monkeypatch.setenv("DEV_SHOW_CODES", "1")
    main._rate_hits.clear()
    main._invalidate_product_cache()
    main.init_db()
    yield


def _demo_user():
    with main.db() as conn:
        return conn.execute("SELECT * FROM users WHERE email = ?", ("demo@voltcore.fr",)).fetchone()


def _first_product():
    with main.db() as conn:
        return conn.execute("SELECT * FROM products ORDER BY id LIMIT 1").fetchone()


def test_registration_and_email_verification_use_one_time_code(fresh_db):
    created = main.register(main.RegisterIn(
        name="Alice Test",
        email="alice@example.test",
        password="motdepasse123",
    ))

    assert created["verification_required"] is True
    assert created["email"] == "alice@example.test"
    assert created["dev_code"].isdigit()

    response = Response()
    verified = main.verify_email(main.VerifyIn(
        email="alice@example.test",
        code=created["dev_code"],
    ), response)

    assert verified["user"]["email"] == "alice@example.test"
    assert verified["token"]
    with main.db() as conn:
        user = conn.execute("SELECT * FROM users WHERE email = ?", ("alice@example.test",)).fetchone()
        assert user["email_verified"] == 1
        assert user["verif_code_hash"] is None


def test_order_reserves_stock_and_release_is_idempotent(fresh_db):
    user = _demo_user()
    product = _first_product()
    original_stock = product["stock"]
    body = main.OrderIn(
        items=[main.OrderItemIn(product_id=product["id"], quantity=2)],
        promo_code=None,
        ship_name="Client Demo",
        ship_address="12 rue Test",
        ship_city="Paris",
        ship_zip="75001",
    )

    with main.db() as conn:
        computed = main.compute_order(conn, body.items, body.promo_code)
        order_id = main.create_pending_order(conn, user, body, computed)
        stock_after_reserve = conn.execute(
            "SELECT stock FROM products WHERE id = ?", (product["id"],)
        ).fetchone()["stock"]
        assert stock_after_reserve == original_stock - 2

        main.release_stock(conn, order_id)
        main.release_stock(conn, order_id)
        stock_after_release = conn.execute(
            "SELECT stock FROM products WHERE id = ?", (product["id"],)
        ).fetchone()["stock"]

    assert stock_after_release == original_stock


def test_paid_order_is_idempotent_and_clears_cart(fresh_db, monkeypatch):
    monkeypatch.setattr(main.threading.Thread, "start", lambda self: None)
    user = _demo_user()
    product = _first_product()
    body = main.OrderIn(
        items=[main.OrderItemIn(product_id=product["id"], quantity=1)],
        promo_code="VOLT10",
        ship_name="Client Demo",
        ship_address="12 rue Test",
        ship_city="Paris",
        ship_zip="75001",
    )

    with main.db() as conn:
        conn.execute(
            "INSERT INTO cart_items (user_id, product_id, quantity) VALUES (?,?,?)",
            (user["id"], product["id"], 1),
        )
        computed = main.compute_order(conn, body.items, body.promo_code)
        order_id = main.create_pending_order(conn, user, body, computed)

    assert main.finalize_order_paid(order_id, "cs_test_once") is True
    assert main.finalize_order_paid(order_id, "cs_test_twice") is True

    with main.db() as conn:
        order = conn.execute("SELECT * FROM orders WHERE id = ?", (order_id,)).fetchone()
        cart_count = conn.execute(
            "SELECT COUNT(*) FROM cart_items WHERE user_id = ?", (user["id"],)
        ).fetchone()[0]

    assert order["status"] == "payée"
    assert order["stripe_session_id"] == "cs_test_once"
    assert cart_count == 0


def test_compute_order_rejects_unavailable_stock(fresh_db):
    product = _first_product()
    with main.db() as conn:
        conn.execute("UPDATE products SET stock = 1 WHERE id = ?", (product["id"],))
        with pytest.raises(HTTPException) as exc:
            main.compute_order(
                conn,
                [main.OrderItemIn(product_id=product["id"], quantity=2)],
                None,
            )

    assert exc.value.status_code == 409


def test_brevo_payload_supports_multiple_recipients_and_attachment(monkeypatch):
    sent = {}

    class FakeResponse:
        status = 201

        def __enter__(self):
            return self

        def __exit__(self, *_):
            return False

    def fake_urlopen(req, timeout):
        sent["timeout"] = timeout
        sent["headers"] = dict(req.header_items())
        sent["body"] = req.data.decode("utf-8")
        return FakeResponse()

    monkeypatch.setattr(mailer.urllib.request, "urlopen", fake_urlopen)
    cfg = {
        "from": "VOLT PC <sender@example.test>",
        "shop": "VOLT PC",
        "brevo_key": "x-api-key",
    }
    msg = mailer.EmailMessage()
    msg["Subject"] = "Test"
    msg["From"] = cfg["from"]
    msg["To"] = "one@example.test, two@example.test"
    msg.set_content("Plain text")
    msg.add_alternative("<p>HTML</p>", subtype="html")
    msg.add_attachment(b"PDF", maintype="application", subtype="pdf", filename="facture.pdf")

    assert mailer._brevo_deliver(cfg, msg, "test") is True
    assert '"email": "sender@example.test"' in sent["body"]
    assert '"email": "one@example.test"' in sent["body"]
    assert '"email": "two@example.test"' in sent["body"]
    assert '"name": "facture.pdf"' in sent["body"]
