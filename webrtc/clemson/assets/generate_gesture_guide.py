"""Draw the documented poses with the same 21-node skeleton as the UI.

Run from repo root: python -m webrtc.clemson.assets.generate_gesture_guide
These are illustrative poses, not captured operator recognition results.
"""
from math import cos, sin, pi
from pathlib import Path
from xml.sax.saxutils import escape

from PIL import Image, ImageDraw, ImageFont
from webrtc.gesture_preview.gestures import classify
from webrtc.gesture_preview.velocity import gesture_to_velocity

FOLDER = Path(__file__).parent
EDGES = [(0,1),(1,2),(2,3),(3,4),(0,5),(5,6),(6,7),(7,8),
         (5,9),(9,10),(10,11),(11,12),(9,13),(13,14),(14,15),(15,16),
         (13,17),(17,18),(18,19),(19,20),(0,17)]
WIDTH, HEIGHT = 1440, 1800
BACKGROUND, CARD, STAGE = '#100d16', '#21172d', '#130e1c'
GREEN, YELLOW, ORANGE, WHITE, MUTED = '#40debe', '#ffcd5f', '#ff974d', '#f7f2fc', '#c0b1cd'


def pose(extended=(), rotation=0, thumb_up=False, open_thumb=False):
    points = [(0., 0., 0.) for _ in range(21)]
    points[:5] = [(.5,.88,0),(.38,.72,0),(.30,.62,0),(.30,.56,0),(.40,.62,0)]
    for index, (base, x, y, tip_y) in enumerate([(5,.39,.51,.12),(9,.51,.48,.08),(13,.62,.50,.13),(17,.73,.57,.25)]):
        points[base] = (x,y,0)
        if index in extended:
            points[base+1] = (x, y+(tip_y-y)*.34,0)
            points[base+2] = (x, y+(tip_y-y)*.7,0)
            points[base+3] = (x,tip_y,0)
        else:
            points[base+1] = (x,y-.08,0)
            points[base+2] = (x+.035,y+.005,0)
            points[base+3] = (x+.025,y+.09,0)
    if thumb_up: points[3:5] = [(.30,.42,0),(.30,.24,0)]
    if open_thumb: points[3:5] = [(.19,.53,0),(.08,.45,0)]
    angle = rotation*pi/180
    return [(.5+cos(angle)*(x-.5)-sin(angle)*(y-.5),
             .5+sin(angle)*(x-.5)+cos(angle)*(y-.5),z) for x,y,z in points]


POSES = [
    ('FORWARD', 'Index up; palm facing the webcam', pose((0,)), 'FORWARD'),
    ('SIDEWAYS LEFT', 'Index pointing left', pose((0,), -90), 'STRAFE_LEFT'),
    ('SIDEWAYS RIGHT', 'Index + middle both pointing left', pose((0,1), -90), 'STRAFE_RIGHT'),
    ('TURN LEFT IN PLACE', 'Thumb up; other fingers curled', pose(thumb_up=True), 'TURN_LEFT'),
    ('TURN RIGHT IN PLACE', 'Thumb down; other fingers curled', pose(rotation=180,thumb_up=True), 'TURN_RIGHT'),
    ('STOP: OPEN PALM', 'Open all four fingers', pose((0,1,2,3),open_thumb=True), 'STOP'),
    ('STOP: CLOSED FIST', 'Curl fingers and thumb', pose(), 'STOP'),
    ('STOP: UNCERTAIN INPUT', 'No hand, two hands, or unclear pose', None, 'UNKNOWN'),
]


def main():
    image = Image.new('RGB', (WIDTH, HEIGHT), BACKGROUND)
    draw = ImageDraw.Draw(image)
    svg = [f'<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 {WIDTH} {HEIGHT}" role="img" aria-labelledby="title desc">',
           '<title id="title">Clemson Go2 gesture and velocity guide</title>',
           '<desc id="desc">Eight illustrated gesture cards using hand landmark skeletons. Commands use default forward speed 0.5 metres per second and turn speed 0.8 radians per second.</desc>',
           f'<rect width="{WIDTH}" height="{HEIGHT}" fill="{BACKGROUND}"/>']

    def font(size, bold=False):
        name = 'segoeuib.ttf' if bold else 'segoeui.ttf'
        path = Path('C:/Windows/Fonts') / name
        return ImageFont.truetype(str(path) if path.exists() else 'DejaVuSans.ttf', size)

    def text(x,y,value,size=24,color=WHITE,bold=False):
        draw.text((x,y), value, font=font(size,bold), fill=color)
        svg.append(f'<text x="{x}" y="{y+size}" fill="{color}" font-family="Segoe UI,Arial,sans-serif" font-size="{size}" font-weight="{700 if bold else 400}">{escape(value)}</text>')

    def rectangle(x,y,w,h,color,radius=0,outline=None):
        draw.rounded_rectangle((x,y,x+w,y+h),radius,fill=color,outline=outline,width=2)
        svg.append(f'<rect x="{x}" y="{y}" width="{w}" height="{h}" rx="{radius}" fill="{color}" stroke="{outline or color}" stroke-width="2"/>')

    def line(a,b,color=GREEN,width=5):
        draw.line((a,b),fill=color,width=width)
        svg.append(f'<line x1="{a[0]}" y1="{a[1]}" x2="{b[0]}" y2="{b[1]}" stroke="{color}" stroke-width="{width}" stroke-linecap="round"/>')

    def circle(point,radius=5,color=YELLOW):
        x,y=point
        draw.ellipse((x-radius,y-radius,x+radius,y+radius),fill=color)
        svg.append(f'<circle cx="{x}" cy="{y}" r="{radius}" fill="{color}"/>')

    text(40,24,'CLEMSON GO2  /  GESTURE NAVIGATION',36,ORANGE,True)
    text(40,77,'Match the direction in your mirrored hand panel. One gesture = one motion axis.',25,MUTED)
    for index,(title,description,points,label) in enumerate(POSES):
        x=40+(index%2)*700
        y=135+(index//2)*400
        rectangle(x,y,660,374,CARD,18,'#513364')
        text(x+24,y+16,title,28,ORANGE,True)
        text(x+24,y+58,description,23,MUTED)
        rectangle(x+20,y+101,620,208,STAGE,12)
        if points is not None:
            # Verify the illustrated pose matches the classifier, not just the caption.
            actual=classify(points,'Right')
            assert actual==label, f'{title}: expected {label}, got {actual}'
            plotted=[(round(x+210+px*240),round(y+108+py*193)) for px,py,_ in points]
            for a,b in EDGES: line(plotted[a],plotted[b])
            for point in plotted: circle(point)
        else:
            text(x+70,y+145,'No clear single-hand gesture',29,MUTED)
            text(x+130,y+204,'Zero velocity requested',26,YELLOW)
        vx,vy,wz=gesture_to_velocity(label)
        text(x+24,y+326,f'vx {vx:+.2f} m/s   |   vy {vy:+.2f} m/s   |   wz {wz:+.2f} rad/s',22,WHITE,True)
    text(40,1750,'Illustrative landmarks, not camera captures. Values shown are defaults; control starts disabled.',22,MUTED)
    svg.append('</svg>')
    image.save(FOLDER/'gesture-guide.png')
    (FOLDER/'gesture-guide.svg').write_text('\n'.join(svg),encoding='utf-8')
    print('Created gesture-guide.png and gesture-guide.svg; all seven illustrated hand poses match the classifier.')


if __name__=='__main__': main()
