#!/usr/bin/env python3

'''
Returns the current status of the HVAC (0==off, 1==on).
Expects a boolean value as an argument, which, if true,
switches the HVAC and reports its new status.
'''
import sys
import os.path
relay_address = 0x04
try:
    import smbus
except ImportError: #means we're not running on Pi
    import smbus2 as smbus
bus = smbus.SMBus(1)
    
def switchRelay():
    """
    Sends integer value of 1 through the i2c, which toggles the fan
    """
    try:
        bus.write_byte(relay_address, 1)
    except:
        return 0

    return 1
    
def main():
	print(switchRelay())

if (__name__ ) == "__main__":
    main()
