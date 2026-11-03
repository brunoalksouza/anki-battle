"""Read Basic Anki notes; strip executable HTML and preserve original content separately."""
import sqlite3,json,sys,re
from html.parser import HTMLParser
from html import unescape
class Content(HTMLParser):
    def __init__(self):
        super().__init__();self.text=[];self.highlights=[];self.images=[];self.colors=[];self.stack=[];self.skip=0
    def handle_starttag(self,tag,attrs):
        a=dict(attrs)
        if tag in ('script','style'):self.skip+=1
        if tag=='img' and a.get('src'):self.images.append(a['src'])
        if tag in ('br','div','p'):self.text.append(' ')
        color=re.search(r'(?:^|;)\s*color\s*:\s*([^;]+)',a.get('style',''))
        c=color.group(1).strip() if color else a.get('color')
        if tag in ('span','font','b','strong'):self.stack.append((tag,c))
    def handle_endtag(self,tag):
        if tag in ('script','style'):self.skip=max(0,self.skip-1)
        if self.stack and tag==self.stack[-1][0]:self.stack.pop()
        if tag in ('div','p'):self.text.append(' ')
    def handle_data(self,data):
        if self.skip:return
        self.text.append(data)
        c=next((c for _,c in reversed(self.stack) if c),None)
        if c:self.highlights.append(data);self.colors.append(c)
def clean(s):return re.sub(r'\s+',' ',re.sub(r'\[sound:[^\]]+\]','',s)).strip()
def color(s):
    if re.fullmatch(r'#[0-9a-fA-F]{6}',s):return s.lower()
    if re.fullmatch(r'#[0-9a-fA-F]{3}',s):return '#'+''.join(c*2 for c in s[1:])
    rgb=re.search(r'rgb\(\s*(\d+),\s*(\d+),\s*(\d+)\s*\)',s)
    if rgb:return '#'+''.join(f'{min(255,int(c)):02x}' for c in rgb.groups())
    return {'green':'#008000','red':'#ff0000','blue':'#0000ff'}.get(s,'#8058d8')
db=sqlite3.connect(sys.argv[1]);db.row_factory=sqlite3.Row
db.create_collation('unicase',lambda a,b:(a.casefold()>b.casefold())-(a.casefold()<b.casefold()))
notes=[]
for row in db.execute('SELECT * FROM notes ORDER BY id'):
    n=dict(row);fields=n['flds'].split('\x1f');front=Content();front.feed(fields[0]);back=Content();back.feed(fields[1] if len(fields)>1 else '')
    sentence=clean(''.join(front.text));term=clean(''.join(front.highlights)) or sentence
    meaning=clean(''.join(back.text));needs=not bool(meaning)
    notes.append({'sourceId':str(n['id']),'term':term[:160],'meaning':meaning[:1000] or 'Significado visual — veja a imagem do verso original.','sentence':sentence,'color':color(front.colors[0]) if front.colors else '#8058d8','tags':n['tags'].split(),'images':front.images+back.images,'audio':re.findall(r'\[sound:([^\]]+)\]',n['flds']),'needsMeaning':needs,'unmarked':not bool(front.highlights),'originalFront':fields[0],'originalBack':fields[1] if len(fields)>1 else '', 'truncatedTerm':len(term)>160})
output={'notes':notes,'cards':[dict(r) for r in db.execute('SELECT * FROM cards')],'reviews':[dict(r) for r in db.execute('SELECT * FROM revlog ORDER BY id')],'decks':[{'id':str(r['id']),'name':r['name']} for r in db.execute('SELECT id,name FROM decks')],'created':db.execute('SELECT crt FROM col').fetchone()[0]}
print(json.dumps(output,ensure_ascii=False))
