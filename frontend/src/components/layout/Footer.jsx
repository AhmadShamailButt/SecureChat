import React from 'react';
import { Link } from 'react-router-dom';
import { Car, Github, Twitter, Facebook, Instagram } from 'lucide-react';

const Footer = () => {
  return (
    <footer className="bg-white dark:bg-black border-t border-border">
      <div className="container mx-auto px-4 py-8 md:py-10">
        <div className="grid grid-cols-1 md:grid-cols-12 gap-6">
          {/* Logo and description */}
          <div className="md:col-span-4 lg:col-span-5 space-y-3">
            <Link to="/" className="flex items-center gap-2">
              <div className="relative flex items-center justify-center h-9 w-9 bg-primary rounded-full overflow-hidden">
                <Car className="h-5 w-5 text-white" />
              </div>
              <span className="text-xl font-bold bg-gradient-to-r from-primary to-primary-700 bg-clip-text text-transparent">
                GoFAST
              </span>
            </Link>
            <p className="text-sm text-muted-foreground mt-2 max-w-md leading-snug">
              Simplifying commutes for FAST NUCES students through carpooling.
              Save money, reduce your carbon footprint, and connect with fellow students.
            </p>
            <div className="flex space-x-4 pt-2">
              <a href="#" className="text-muted-foreground hover:text-primary transition-colors" aria-label="GitHub">
                <Github className="h-5 w-5" />
              </a>
              <a href="#" className="text-muted-foreground hover:text-primary transition-colors" aria-label="Twitter">
                <Twitter className="h-5 w-5" />
              </a>
              <a href="#" className="text-muted-foreground hover:text-primary transition-colors" aria-label="Facebook">
                <Facebook className="h-5 w-5" />
              </a>
              <a href="#" className="text-muted-foreground hover:text-primary transition-colors" aria-label="Instagram">
                <Instagram className="h-5 w-5" />
              </a>
            </div>
          </div>

          {/* Navigation sections */}
          {[
            { title: 'Platform', links: ['Home', 'Find Carpool', 'Dashboard', 'Messages'], paths: ['/', '/carpools', '/dashboard', '/messages'] },
            { title: 'Resources', links: ['Help Center', 'Safety Guidelines', 'FAQ', 'Contact Us'] },
            { title: 'Legal', links: ['Privacy Policy', 'Terms of Service', 'Cookie Policy'] }
          ].map((section, i) => (
            <div className="md:col-span-2 lg:col-span-2" key={i}>
              <h3 className="text-sm font-semibold mb-3">{section.title}</h3>
              <ul className="space-y-2">
                {section.links.map((label, idx) => (
                  section.paths ?
                    <li key={idx}>
                      <Link to={section.paths[idx]} className="text-sm text-muted-foreground hover:text-foreground transition-colors">
                        {label}
                      </Link>
                    </li> :
                    <li key={idx}>
                      <a href="#" className="text-sm text-muted-foreground hover:text-foreground transition-colors">
                        {label}
                      </a>
                    </li>
                ))}
              </ul>
            </div>
          ))}
        </div>

        <div className="mt-8 pt-6 border-t border-border">
          <div className="flex flex-col md:flex-row md:items-center justify-between gap-3">
            <p className="text-sm text-muted-foreground">
              &copy; {new Date().getFullYear()} GoFAST. All rights reserved.
            </p>
            <div className="flex flex-wrap gap-4 text-sm">
              <a href="#" className="text-muted-foreground hover:text-foreground transition-colors">Privacy Policy</a>
              <a href="#" className="text-muted-foreground hover:text-foreground transition-colors">Terms of Service</a>
              <a href="#" className="text-muted-foreground hover:text-foreground transition-colors">Cookie Policy</a>
            </div>
          </div>
        </div>
      </div>
    </footer>
  );
};

export default Footer;
