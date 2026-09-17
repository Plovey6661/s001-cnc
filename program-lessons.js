const setup='METRIC\nSECONDS\nABSOLUTE\n';
const approach=(x,y)=>`RAPID Z0 ZF25\nRAPID X${x} Y${y} XF20 YF20\nLINEAR Z-28 F10\n`;
const retract='\nLINEAR Z0 F10';
export const lessons=[
  {id:'linear',name:'01 同步直線',command:'LINEAR',behavior:'兩軸以同一比例走向終點，刀痕保持直線。',tip:'修改 X、Y 終點可改變直線斜率。F 是整條路徑速度，不是每軸速度。',syntax:'LINEAR X<終點> Y<終點> F<路徑速度>',source:'Commands/LINEAR_Command.html',code:setup+approach(-10,-8)+'LINEAR X12 Y10 F6\nLINEAR X12 Y-8 F6\nLINEAR X-10 Y-8 F6'+retract},
  {id:'rapid',name:'02 獨立快速定位',command:'RAPID',behavior:'各軸同時出發；較早到達的軸先停止，因此軌跡可能轉折。',tip:'試把 XF6 改為 XF12，比較到達時間及路徑。本範例故意接觸工件，讓你看見快速定位的軌跡。',syntax:'RAPID X<終點> Y<終點> XF<X速度> YF<Y速度>',source:'Commands/RAPID_Command.html',code:setup+approach(-10,-8)+'RAPID X12 Y10 XF6 YF12'+retract},
  {id:'cw',name:'03 順時針圓弧',command:'CW',behavior:'在指定的兩軸平面沿順時針走圓弧；終點等於起點時可走整圓。',tip:'I、J 是圓心相對起點的偏移，分別對應命令中第一、第二個軸。改成 CCW 可反向走同一圓。',syntax:'CW X<終點> Y<終點> I<第一軸偏移> J<第二軸偏移> F<速度>',source:'Commands/CW_Command.html',code:setup+approach(8,0)+'CW X8 Y0 I-8 J0 F6'+retract},
  {id:'ccw',name:'04 逆時針圓弧',command:'CCW',behavior:'沿逆時針走圓弧。正半徑 R 取短弧，負半徑 R 取長弧。',tip:'試把第一段 R10 改為 R-10，看長弧如何繞行。半徑法不支援整圓。',syntax:'CCW X<終點> Y<終點> R<半徑> F<速度>',source:'Commands/CCW_Command.html',code:setup+approach(-8,0)+'CCW X8 Y0 R10 F6'+retract},
  {id:'quad',name:'05 二次貝茲曲線',command:'BEZIER QUAD',behavior:'三個控制點定義一條平順曲線；中間控制點拉動彎曲方向。',tip:'P0 是起點，P2 是終點；P1 不一定在曲線上。修改 Y 的中間值 16，觀察彎曲程度。',syntax:'BEZIER QUAD X, P0x, P1x, P2x, Y, P0y, P1y, P2y',source:'Commands/BEZIER_Command.html',code:setup+'#bezier tolerance 0.001\n'+approach(-10,-6)+'F6\nBEZIER QUAD X, -10, 0, 12, Y, -6, 16, -6'+retract},
  {id:'cubic',name:'06 三次貝茲曲線',command:'BEZIER CUBIC',behavior:'四個控制點可形成 S 型曲線，兩個中間點分別改變入彎與出彎方向。',tip:'修改 P1、P2 的 Y 值 18、-18。所有控制點都必須是絕對座標，P0 必須吻合目前位置。',syntax:'BEZIER CUBIC X, P0x, P1x, P2x, P3x, Y, P0y, P1y, P2y, P3y',source:'Commands/BEZIER_Command.html',code:setup+'#bezier tolerance 0.001\n'+approach(-10,0)+'F6\nBEZIER CUBIC X, -10, -5, 6, 12, Y, 0, 18, -18, 0'+retract},
  {id:'pvt',name:'07 位置・速度・時間',command:'PVT',behavior:'指定每段終點、末速度與時間，以三次多項式連接；XYZ 可同時運動。',tip:'本例同時改變 Z，會留下深淺不同的曲線刀痕。TIME 永遠使用毫秒；前段末速度接到下段初速度。',syntax:'PVT X<位置>,<末速> Y<位置>,<末速> Z<位置>,<末速> TIME <毫秒>',source:'Commands/PVT_Command.html',code:setup+approach(-10,-6)+'PVT X0, 5 Y8, 0 Z-30, 0 TIME 3000\nPVT X12, 0 Y-6, 0 Z-28, 0 TIME 3000\nWAIT MOVEDONE X Y Z'+retract}
];
