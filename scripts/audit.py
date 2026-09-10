"""Project validation entry point used by ``npm run check``.

The locale audit is the authoritative generated-site check for this static
mirror. Keeping this small wrapper preserves the existing package script while
making the Vietnamese route/content checks reproducible in CI and locally.
"""
from audit_vi import main


if __name__ == "__main__":
    main()
