interface StepIndicatorProps {
  currentStep: number;
  totalSteps: number;
}

export default function StepIndicator({ currentStep, totalSteps }: StepIndicatorProps) {
  return (
    <div className="step-indicator">
      <span>Step {currentStep} of {totalSteps}</span>
    </div>
  );
}
