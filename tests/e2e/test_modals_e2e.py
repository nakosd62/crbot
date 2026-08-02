# tests/e2e/test_modals_e2e.py
import pytest
import json
from playwright.sync_api import Page, expect

@pytest.fixture(autouse=True)
def setup_routes_and_navigate(page: Page):
    """Fixture to intercept config route and navigate to the home page before each test."""
    def handle_config(route):
        route.fulfill(
            status=200,
            content_type="application/json",
            body=json.dumps({
                "database_name": "testdb",
                "username": "testuser",
                "default_database_url": "postgresql://user:pass@localhost:23456/testdb"
            })
        )

    # Intercept API calls so the tests don't rely on live DBs or API keys
    page.route("**/api/config", handle_config)
    
    # Navigate to app
    page.goto("http://localhost:3000/")

def test_config_modal_open_save_and_close(page: Page):
    """Test opening configuration modal, modifying connection settings, and saving."""
    # 1. Open Configuration Modal
    page.click("#configBtn")

    # 2. Verify Config Modal is visible
    config_modal = page.locator("#configModal")
    expect(config_modal).to_be_visible()

    # 3. Fill in DB URL
    page.fill("#modalDbUrl", "postgresql://postgres:secret@localhost:5432/my_app_db")

    # 4. Click Save Changes button
    page.click("#configSaveBtn")

    # 5. Verify modal is hidden
    expect(config_modal).not_to_be_visible()


def test_help_modal_open_and_close(page: Page):
    """Test opening and closing the help popup modal."""
    # 1. Open Help Modal
    page.click("#helpBtn")

    # 2. Verify Help Modal is visible and contains documentation header
    help_modal = page.locator("#helpModal")
    expect(help_modal).to_be_visible()
    expect(help_modal).to_contain_text("Help & Documentation")

    # 3. Close Help Modal via close button
    page.click("#helpModalCloseBtn")

    # 4. Verify Help Modal is closed
    expect(help_modal).not_to_be_visible()