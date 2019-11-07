#include <Wire.h>
#include <Adafruit_MAX31856.h>
Adafruit_MAX31856 max = Adafruit_MAX31856(10, 11, 12, 13);
#define SLAVE_ADDRESS 0x04
int number = 0;
//Represent all temperatures as multiplied by 100 
float roomTemp = 0;
int temp;
bool fanOn = false;
int int_to_send;
String data_to_send;
//Absolute high and low temps. This sketch SHALL NOT allow
//temperatures to get outside this range even if instructed otherwise
#define LOW_TEMP nod
1833
#define HIGH_TEMP 2667


void setup() {
  //pinMode(13, OUTPUT);
  Serial.begin(9600); // start serial for output
  // initialize i2c as slave
  Wire.begin(SLAVE_ADDRESS);
  
  // define callbacks for i2c communication
  Wire.onReceive(receiveData);
  Wire.onRequest(sendData);
  
  max.begin();
  max.setThermocoupleType(MAX31856_TCTYPE_K);
  
  // set pin 2 as output to control solid state relay
  pinMode(2, OUTPUT);
  //set pin 4 as input for error-sensing circuit
  pinMode(4, INPUT);
  
  Serial.println("Ready!");
}

void loop() {

  //Serial.println(max.readThermocoupleTemperature());
  roomTemp = max.readThermocoupleTemperature();
  temp = int(roomTemp * 100);


  //Enforce temperature limits.  Even if toggle command is 
  //received when temperature is outside this limit, this will
  //override that command once the loop starts again
  if(fanOn == false)
  {
    if(temp > HIGH_TEMP)
    {
      digitalWrite(2, HIGH); //turn fan on
      fanOn = true;
    }
  }else{
    if(temp < LOW_TEMP)
    {
      digitalWrite(2, LOW); //turn fan off
      fanOn = false;
    }
  }

  int_to_send = temp * 10;
  if(digitalRead(4) == HIGH) {
    int_to_send += 2;
  }
  else if(fanOn == true){
    int_to_send += 1;
  }
  //else int_to_send += 0 
  data_to_send = String(int_to_send);
  Serial.println(temp);
  Serial.println(fanOn);
delay(1000);
}

// callback for receiving request to toggle fan
void receiveData(int byteCount){

  while(Wire.available()) {
    number = Wire.read();
    Serial.print("data received: ");
    Serial.println(number);


    if (number == 1){
      if (fanOn == false && temp > LOW_TEMP){
        digitalWrite(2, HIGH);
        fanOn = true;
      }
      else if(fanOn == true && temp < HIGH_TEMP){
        digitalWrite(2, LOW); 
        fanOn = false;
      }
    }
  }
}


// callback for sending temperature and fan status
void sendData(){
  Wire.write(data_to_send.c_str());
  Serial.println(sizeof(data_to_send));
}
