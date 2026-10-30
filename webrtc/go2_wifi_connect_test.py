"""Windows Go2 WebRTC connection test. Sends no motion commands."""
import asyncio
import getpass
import os
import re

from unitree_webrtc_connect import UnitreeWebRTCConnection, WebRTCConnectionMethod


async def test(key):
    connection = UnitreeWebRTCConnection(
        WebRTCConnectionMethod.LocalAP, aes_128_key=key
    )
    try:
        print("Connecting to Go2 AP at 192.168.12.1 (no motion commands)...", flush=True)
        await asyncio.wait_for(connection.connect(), timeout=30)
        print("CONNECTED. Holding connection for 5 seconds.", flush=True)
        await asyncio.sleep(5)
    finally:
        try:
            await asyncio.wait_for(connection.disconnect(), timeout=5)
        except Exception as error:
            print("Disconnect warning: {}: {}".format(type(error).__name__, error))


def main():
    key = os.environ.get("UNITREE_AES_128_KEY", "").strip()
    if not key:
        key = getpass.getpass("Go2 AES key (hidden input): ").strip()
    if not re.fullmatch(r"[0-9a-fA-F]{32}", key):
        print("Expected a 32-character hexadecimal AES key.")
        return 1
    try:
        asyncio.run(test(key))
    except KeyboardInterrupt:
        print("Cancelled.")
        return 130
    except Exception as error:
        print("Connection failed: {}: {}".format(type(error).__name__, error))
        return 1
    print("Connection test finished. No motion commands were sent.")
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
