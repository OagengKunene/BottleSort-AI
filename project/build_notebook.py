"""Create and sequentially execute a plain-Python, Colab-compatible notebook."""
from pathlib import Path
import json, io, contextlib, os

ROOT=Path(__file__).resolve().parents[1]
source=(ROOT/'project/train_model.py').read_text()
source=source.replace('ROOT = Path(__file__).resolve().parents[1]', "ROOT = Path.cwd()\n(ROOT / 'project').mkdir(exist_ok=True)")
source=source.replace("if __name__=='__main__': main()",'')

def md(text): return {'cell_type':'markdown','metadata':{},'source':text}
def code(text): return {'cell_type':'code','metadata':{},'source':text,'execution_count':None,'outputs':[]}
cells=[
 md('# BottleSort Lab — Model Training\n\n**Kunene · AI and industrial automation software simulation**\n\nThis notebook generates labelled synthetic bottle images, trains an actual pixel classifier, evaluates independent images, and exports the weights used by the browser simulator. It does not claim to recognise real bottle photographs.'),
 md('## 1. Setup and reproducible image generator\n\nRun in Google Colab or a Python environment containing NumPy and scikit-learn. If needed, install these dependencies with `pip install numpy scikit-learn` before running. The generator uses the same deterministic random algorithm and geometric pixel rules as `engine.js`. Class 0 is an aligned cap, class 1 is a missing cap, and class 2 is a tilted cap.'),
 code(source),
 md('## 2. Train, evaluate, and export\n\nUse 360 training images and 140 independently seeded test images for each class. Logistic regression learns from the flattened grayscale pixels; the true class is the training target and is never an inference input. The evaluation is on synthetic images only.'),
 code("main()"),
 md('## 3. Inspect the measured results\n\nThe confusion-matrix rows are the known conditions and its columns are model predictions. This test accuracy is measured before the controller applies the confidence threshold.'),
 code("report = json.loads((ROOT / 'project' / 'evaluation.json').read_text())\nprint(f\"Held-out accuracy: {100*report['test_accuracy']:.4f}%\")\nprint('Rows = actual; columns = predicted; class order =', CLASSES)\nfor name, row in zip(CLASSES, report['confusion_matrix']):\n    print(f'{name:14s} {row}')\nfor name in CLASSES:\n    item = report['classification_report'][name]\n    print(f\"{name:14s} precision={item['precision']:.4f} recall={item['recall']:.4f} F1={item['f1-score']:.4f}\")\nprint(report['evaluation_scope'])"),
 md('## 4. Reproduce the controller rule\n\nThe highest model probability below the chosen threshold produces review. Otherwise, class 0 is accepted and classes 1–2 are rejected. Test a missing-cap image without sending its class label to the classifier. The generator uses the label to construct the input image; inference uses only pixels and learned coefficients.'),
 code("export = json.loads((ROOT / 'dist' / 'model.json').read_text())\npixels = image(1, 2007919, difficulty=0.15)\nscores = np.asarray(export['coefficients']) @ pixels + np.asarray(export['intercepts'])\nprobabilities = np.exp(scores-scores.max())\nprobabilities /= probabilities.sum()\npredicted = int(probabilities.argmax())\nthreshold = 0.85\nroute = 'review' if probabilities[predicted] < threshold else ('accept' if predicted == 0 else 'reject')\nprint('Input shape:', pixels.shape)\nprint('Predicted:', CLASSES[predicted])\nprint('Probabilities:', dict(zip(CLASSES, probabilities.round(6).tolist())))\nprint('Controller route:', route)\nprint('Browser weights exported to:', str(ROOT / 'dist' / 'model.json'))"),
 md('## 5. Use the exported model\n\nDownload `dist/model.json` from the notebook files panel, place it in the application’s `dist` directory, and reload the simulator. Run the downloaded application using `python -m http.server 8000 --directory dist`.\n\nCompare live performance under lighting disturbance values above the test range. High confidence does not guarantee a correct prediction. Training on synthetic geometric images is a learning exercise; a real installation needs representative photographs, a separate real test set, and hardware validation.')
]
notebook={'cells':cells,'metadata':{'kernelspec':{'display_name':'Python 3','language':'python','name':'python3'},'language_info':{'name':'python','version':'3'},'colab':{'provenance':[]}},'nbformat':4,'nbformat_minor':5}
namespace={'__name__':'__main__'}
os.chdir(ROOT)
count=0
for i,cell in enumerate(cells):
    cell['id']=f'bottlesort-{i:02d}'
    if cell['cell_type']!='code':continue
    count+=1;stream=io.StringIO()
    with contextlib.redirect_stdout(stream):exec(compile(cell['source'],f'<notebook cell {count}>','exec'),namespace)
    cell['execution_count']=count
    if stream.getvalue():cell['outputs']=[{'output_type':'stream','name':'stdout','text':stream.getvalue()}]
(ROOT/'dist/train_model.ipynb').write_text(json.dumps(notebook,indent=1))
print(json.dumps({'notebook':'dist/train_model.ipynb','executed_code_cells':count,'failed_cells':0}))
