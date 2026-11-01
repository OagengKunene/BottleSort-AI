"""Train the reproducible synthetic cap-inspection model. Run with Python 3."""
from pathlib import Path
import json
import numpy as np
from sklearn.linear_model import LogisticRegression
from sklearn.metrics import accuracy_score, confusion_matrix, classification_report

ROOT = Path(__file__).resolve().parents[1]
W, H = 32, 48
CLASSES = ['cap_ok', 'missing_cap', 'tilted_cap']

class Random:
    """Mulberry32, shared verbatim in spirit with the browser renderer."""
    def __init__(self, seed): self.state = seed & 0xffffffff
    def next(self):
        self.state = (self.state + 0x6D2B79F5) & 0xffffffff
        t = self.state
        t = ((t ^ (t >> 15)) * (t | 1)) & 0xffffffff
        t ^= (t + (((t ^ (t >> 7)) * (t | 61)) & 0xffffffff)) & 0xffffffff
        return ((t ^ (t >> 14)) & 0xffffffff) / 4294967296

def image(label, seed, difficulty=0.0):
    r = Random(seed)
    cx = 16 + (r.next() - .5) * 3
    dy = (r.next() - .5) * 2
    width = 6.0 + r.next()
    light = .75 + r.next() * .5
    angle = (r.next() - .5) * .10 if label == 0 else (.35 + r.next() * .40) * (-1 if r.next() < .5 else 1)
    shift = 0 if label != 2 else (1.0 + r.next() * 1.0)
    # This is a controlled optical disturbance; it never exposes the class to inference.
    light *= 1 - difficulty * .65
    data = np.empty((H,W), dtype=np.float64)
    for y in range(H):
        for x in range(W):
            dx = x + .5 - cx
            yy = y + .5 - dy
            v = .10 + .018 * y/H
            body = abs(dx) < width and 19 <= yy < 43
            shoulder = 14 <= yy < 19 and abs(dx) < 3.2 + (yy-14)/5 * (width-3.2)
            neck = abs(dx) < 3.2 and 10 <= yy < 19
            if body or shoulder or neck:
                v = .46 + .10*(dx+width)/(width*2)
                if abs(dx+width*.63) < .65: v += .15
                if body and 25 <= yy < 35: v = .73
                if body and 28 <= yy < 31 and abs(dx)<3.7: v = .29
            if label != 1:
                xx = dx-shift
                yc = yy-10
                rx = xx*np.cos(angle)+yc*np.sin(angle)
                ry = -xx*np.sin(angle)+yc*np.cos(angle)
                if abs(rx)<4.5 and abs(ry)<2.8: v=.83 - .06*(int(x)%2)
            v = v*light + (r.next()-.5)*(.07+difficulty*.34)
            data[y,x]=np.clip(v,0,1)
    return data.ravel()

def dataset(n, start):
    rows, labels = [], []
    for c in range(3):
        for k in range(n):
            rows.append(image(c, start+c*100000+k, difficulty=.15*(k%4)))
            labels.append(c)
    return np.array(rows), np.array(labels)

def main():
    X, y = dataset(360, 104729)
    Xt, yt = dataset(140, 900001)
    model = LogisticRegression(C=.32, max_iter=600, random_state=17)
    model.fit(X,y)
    pred=model.predict(Xt)
    probabilities=model.predict_proba(Xt)
    report = {
        'model':'Multiclass logistic regression on 32 × 48 grayscale pixels',
        'classes':CLASSES,'seed':17,'training_samples':len(y),'test_samples':len(yt),
        'test_accuracy':float(accuracy_score(yt,pred)),
        'confusion_matrix':confusion_matrix(yt,pred,labels=[0,1,2]).tolist(),
        'classification_report':classification_report(yt,pred,target_names=CLASSES,output_dict=True,zero_division=0),
        'mean_confidence':float(probabilities.max(axis=1).mean()),
        'evaluation_scope':'Independent synthetic test images; not evidence of performance on real bottle photographs.',
        'train_seeds':'104729–105088; 204729–205088; 304729–305088',
        'test_seeds':'900001–900140; 1000001–1000140; 1100001–1100140',
    }
    export = {'width':W,'height':H,'classes':CLASSES,'coefficients':np.round(model.coef_,9).tolist(),
              'intercepts':np.round(model.intercept_,9).tolist(),'report':report}
    dist=ROOT/'dist'
    dist.mkdir(exist_ok=True)
    (dist/'model.json').write_text(json.dumps(export,separators=(',',':')))
    (ROOT/'project'/'evaluation.json').write_text(json.dumps(report,indent=2))
    print(json.dumps({k:report[k] for k in ['training_samples','test_samples','test_accuracy','confusion_matrix']},indent=2))

if __name__=='__main__': main()
