# BottleSort Lab — AI Bottle Inspection and Automated Sorting

Prepared for Kunene · 1 November 2026

## 1. Project objective

Demonstrate an automatic manufacturing sequence that detects a bottle, captures an image, predicts its cap condition, chooses a route, actuates a virtual sorting gate, and records an inspection. A user can change production speed, the probability of generated defects, optical disturbance, and the minimum confidence required for automatic acceptance or rejection.

The deliverable is a working software simulation with an actual trained classifier. It uses synthetic optical images, rather than a pretrained model claimed to recognise arbitrary real bottles.

## 2. Functional sequence

| Stage | Input | Processing | Output |
| --- | --- | --- | --- |
| Detect | Bottle position and unique ID | Virtual arrival sensor | Bottle tracked on conveyor |
| Capture | Known synthetic cap condition and independent image seed | Procedural 32 × 48 grayscale optical renderer | 1,536 pixel intensities |
| Predict | Pixel array only | Learned multiclass logistic regression and softmax | Three class probabilities |
| Decide | Probabilities and confidence setting | Review below threshold; otherwise accept aligned cap or reject cap defect | Route latched to bottle ID |
| Divert | Bottle position and its latched route | Virtual diverter | Accept, reject, or review lane |
| Record | Inspection snapshot and sorting completion | Browser history and CSV export | Traceable inspection record |

The software controller uses requestAnimationFrame and elapsed simulation time. Line speed multiplies virtual time. Normal mode introduces a bottle about every 1.85 simulation seconds; one-cycle mode advances existing in-flight bottles or creates exactly one new bottle when the line is empty. Sending a test bottle while paused runs a single cycle without turning on automatic spawning.

The generator samples whether each normal bottle is defective. The defect-frequency control is a generation probability, so a finite run need not contain exactly that percentage of defects. Missing and tilted caps are sampled in equal proportions among generated defects.

## 3. Data and preprocessing

All images are generated from mathematical bottle and cap shapes. Three classes are represented: aligned cap, missing cap, and tilted cap. Images vary horizontally, vertically, in body width, cap angle, illumination, and pixel noise. There are no real customer records or real production measurements.

Training contains 1,080 images, balanced as 360 per class. Testing contains 420 images, balanced as 140 per class. Test images use seeds disjoint from training seeds. Pixel values are clipped to [0, 1]; there is no additional standardisation.

The held-out evaluation uses lighting disturbance values 0, 0.15, 0.30, and 0.45. Users can increase the live disturbance to 1.0, which makes the simulation harder than the evaluated conditions. The synthetic test result must not be interpreted as the expected result under every live control setting.

## 4. Model training and evaluation

The implementation uses scikit-learn LogisticRegression with C = 0.32, maximum iterations = 600, and random_state = 17. A multiclass model learns one weight vector per class. Browser code evaluates the exported weights and applies a numerically stable softmax by subtracting the largest class score before exponentiation.

The model achieved **419 correct predictions out of 420**, or **99.7619% synthetic test accuracy**. The application rounds this to 99.8%.

| Actual / predicted | Aligned cap | Missing cap | Tilted cap |
| --- | ---: | ---: | ---: |
| Aligned cap | 139 | 0 | 1 |
| Missing cap | 0 | 140 | 0 |
| Tilted cap | 0 | 0 | 140 |

One correctly capped synthetic bottle was predicted to have a tilted cap. This evaluation measures the classifier's top prediction before applying the confidence threshold. Exact class precision, recall, and F1 scores are included in evaluation.json. Accuracy on real photographs is unknown.

## 5. Automation and confidence routing

The controller first checks the largest predicted probability. If it is below the configured threshold, the bottle goes to the review lane. Otherwise, an aligned-cap prediction is accepted and a missing- or tilted-cap prediction is rejected. A probability exactly equal to the threshold qualifies for automatic routing.

Confidence is a model probability, not a calibrated guarantee of correctness. A model can be confidently wrong. Raising the threshold typically increases the opportunity for review, but cannot by itself validate an inspection system. The interface retains the probabilities and the applied threshold so experiments can examine this trade-off.

Each bottle keeps its own decision, avoiding the error of routing an earlier bottle using a later bottle's prediction. A change in threshold applies at the next inspection and never changes decisions already made. A lighting change applies at camera capture. Speed affects simulation time, rather than retraining the model.

The model does not read the synthetic condition label. That label is used to render the camera image and compute live evaluation against ground truth. Its presence in the activity log makes misclassifications observable.

## 6. Interface and records

The simulation view shows the moving conveyor, inspection camera, routing branches, current totals, and recent inspections. The model lab provides training/test counts, held-out and live accuracy, and the confusion matrix. The activity log provides bottle-ID search, route filtering, individual image inspection, and CSV download. The project guide explains the sequence and provides the project archive and notebook.

Accepted, rejected, and review counts are decision counts: together they equal the number inspected. The sorting-state column distinguishes decisions still in transit from completed sorting. A page reload interrupts in-flight bottles; their logs are marked Interrupted instead of claiming they were sorted. The simulated clock and the latest 2,000 records persist in that browser. Counts and live accuracy use this retained window once the limit is reached. No claim of a physical factory audit trail is made.

CSV records include bottle ID, simulation seconds, known condition, predicted class, confidence, route, sorting state, all three probabilities, applied threshold, lighting disturbance, defect-generation probability, line speed, and image seed. The seed and disturbance reproduce each camera image.

## 7. Verification

Automated cross-language tests compare the Python and JavaScript renderers on all 1,536 pixels for nine representative images, compare class probabilities, regenerate the complete 420-image confusion matrix in JavaScript, check route decisions on both sides of and exactly at the threshold, and confirm high optical disturbance can produce review candidates. Browser checks cover line operation, manual defects, single-cycle behavior, model statistics, log filtering, and CSV export.

## 8. Suggested experiments

1. Run with 25% generated defects and the default 85% confidence setting. Record the number of accepted, rejected, and review decisions. Compare the observed defect proportion with the generation probability.
2. Send one bottle of each defect type and examine the image, predicted class, and route.
3. Increase optical disturbance from 15% to 100%. Compare live classifier accuracy with the number of review decisions.
4. Compare minimum confidence settings of 70%, 85%, and 99% on matched conditions. Discuss the trade-off between automatic decisions, false rejection, false acceptance, and review workload.
5. Export the records. Compute a live confusion matrix using the known and predicted conditions. Separately analyse route correctness because review is a controller action, not a fourth model class.

## 9. Scope and next development steps

This version has no physical sensor, PLC, camera stream, motor, or reject actuator. The optical task covers only cap presence and alignment. It does not assess fill volume, seal integrity, label correctness, contamination, or pharmaceutical release suitability.

For a physical prototype, collect labelled images of representative bottles under actual lighting, separate test sets by bottle/production run rather than near-duplicate frames, compare suitable computer-vision models, measure class-level false acceptance and false rejection, and validate timing and ID tracking with the chosen controller. Real actuation would require a dedicated hardware design and independent machine-safety controls.

## 10. References

- scikit-learn, Logistic regression: https://scikit-learn.org/stable/modules/linear_model.html#logistic-regression
- scikit-learn, Model evaluation: https://scikit-learn.org/stable/modules/model_evaluation.html
- The runnable training code, independent image seeds, exported weights, environment versions, and measured test outputs included with this project.
