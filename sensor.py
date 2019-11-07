#!/usr/bin/env python3
import sys
import random
import struct
from time import sleep
from datetime import datetime as t
address = 0x04
gpio_in_use = int(sys.argv[1])

try:
    import smbus
except ImportError: #means we're not running on Pi
    import smbus2 as smbus
bus = smbus.SMBus(1)
    
'''
When GPIO is not in use (testing), returns a random value.
Otherwise, gets data from the Arduino.  This data is expected
to be a 5-width string convertable to a 5-digit integer. The
first four digits correspond to the Celsius temperature * 100,
the last being a 1 or 0 corresponding to fan state.  For convenience's
sake, I'll just let sensor_app.js parse this
'''
def readTemp():
    if not gpio_in_use:
        celsius_times_hundred = random.randrange(4000, 9000)
        fan_state = 0
    else:
        # Try every 5 seconds for 2 minute or until value obtained
        for i in range(24):
            try:
                received = bytearray(bus.read_i2c_block_data(address, 0, 5))
                data = int(struct.unpack("5s", received)[0])
                #Sanity check; received data should always end in 0 or 1
                if data % 10 > 1:
                    raise ValueError()
                break
            except:
                sleep(5)
    try:
        return data
    except:
        return -1
    
def main():
    data = readTemp()
    print(data)

if __name__ == "__main__":
    main()
    
