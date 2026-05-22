/* Hallmark · macrostructure: Marquee Hero · genre: modern-minimal · tone: refined editorial-tech
 * pre-emit critique: P5 H5 E4 S5 R4 V4
 * Standalone marketing landing — off-white/blue identity scoped to .landing-page (index.css). */
import LandingNav from '../components/landing/LandingNav';
import Hero from '../components/landing/Hero';
import HowItWorks from '../components/landing/HowItWorks';
import Features from '../components/landing/Features';
import ArgusSection from '../components/landing/ArgusSection';
import FinalCta from '../components/landing/FinalCta';
import Footer from '../components/landing/Footer';

export default function Landing() {
  return (
    <div id="top" className="landing-page min-h-screen overflow-x-clip font-sans antialiased">
      <LandingNav />
      <main>
        <Hero />
        <HowItWorks />
        <Features />
        <ArgusSection />
        <FinalCta />
      </main>
      <Footer />
    </div>
  );
}
